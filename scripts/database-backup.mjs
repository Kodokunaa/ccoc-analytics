import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  writeFile,
  readdir,
  rename,
  unlink,
  lstat,
} from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
process.loadEnvFile(path.resolve(".env"));
const dbUrl = new URL(process.env.DATABASE_URL);
const directory = path.resolve(
  process.env.BACKUP_DIR || "C:/Users/ACER/Documents/churchbackup",
);
const pgBin = process.env.PG_BIN_DIR || "C:/Program Files/PostgreSQL/18/bin";
const database = decodeURIComponent(dbUrl.pathname.slice(1));
const connection = [
  "--host",
  dbUrl.hostname,
  "--port",
  dbUrl.port || "5432",
  "--username",
  decodeURIComponent(dbUrl.username),
];
const env = { ...process.env, PGPASSWORD: decodeURIComponent(dbUrl.password) };
const tables = [
  "CapitalCampaignEntry",
  "Service",
  "AttendanceRecord",
  "GivingRecord",
  "User",
  "ReportMonth",
  "ReportArtifact",
  "ManusReportTask",
  "AppSetting",
  "AuditLog",
  "Target",
  "Role",
  "Session",
  "LoginAttempt",
  "GoogleViewer",
  "GoogleViewerSession",
  "PublicExportLog",
  "PasswordReset",
];
const countQuery = (names) =>
  names
    .map((t) => `SELECT '${t}' AS table_name, count(*) FROM "${t}"`)
    .join(" UNION ALL ");
const countsSql = countQuery(tables);
const checksum = (bytes) => createHash("sha256").update(bytes).digest("hex");
function run(tool, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(path.join(pgBin, `${tool}.exe`), args, {
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      error = "";
    p.stdout.on("data", (b) => (output += b));
    p.stderr.on("data", (b) => (error += b));
    p.on("error", () =>
      reject(new Error(`Cannot start ${tool}. Check PG_BIN_DIR.`)),
    );
    p.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(
            new Error(
              `${tool} failed: ${error.replaceAll(decodeURIComponent(dbUrl.password), "[redacted]")}`,
            ),
          ),
    );
  });
}
async function backup() {
  await mkdir(directory, { recursive: true });
  const name = `ccoc-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}.dump`;
  const file = path.join(directory, name),
    temporary = `${file}.partial`;
  const client = new PrismaClient();
  let counts;
  try {
    counts = await client.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const [{ snapshot }] = await tx.$queryRawUnsafe(
          "SELECT pg_export_snapshot() AS snapshot",
        );
        const results = await tx.$queryRawUnsafe(countsSql);
        await run("pg_dump", [
          ...connection,
          "--dbname",
          database,
          "--format=custom",
          "--no-owner",
          "--no-privileges",
          "--snapshot",
          snapshot,
          "--file",
          temporary,
        ]);
        return Object.fromEntries(
          results.map((r) => [r.table_name, Number(r.count)]),
        );
      },
      { isolationLevel: "RepeatableRead", timeout: 120000 },
    );
    await rename(temporary, file);
    const bytes = await readFile(file);
    await writeFile(
      `${file}.json`,
      JSON.stringify(
        {
          version: 1,
          filename: name,
          createdAt: new Date().toISOString(),
          checksum: checksum(bytes),
          bytes: bytes.length,
          counts,
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
    await run("pg_restore", ["--list", file]);
    // Keep the most recent 30 successful backups. Never recurse or remove unrelated files.
    const names = (await readdir(directory))
      .filter((n) =>
        /^ccoc-\d{4}-\d{2}-\d{2}T[\dTZ-]+-[a-f0-9]{6}\.dump$/.test(n),
      )
      .sort()
      .reverse();
    for (const name of names.slice(30))
      for (const suffix of ["", ".json"]) {
        const candidate = path.resolve(directory, name + suffix);
        if (path.dirname(candidate) !== directory)
          throw new Error("Backup path escaped destination");
        try {
          const stat = await lstat(candidate);
          if (stat.isFile() && !stat.isSymbolicLink()) await unlink(candidate);
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
      }
    console.log(
      JSON.stringify({ ok: true, file, bytes: bytes.length, counts }),
    );
  } finally {
    await client.$disconnect();
  }
}
async function restore(verify) {
  const names = (await readdir(directory))
    .filter((n) => /^ccoc-.*\.dump$/.test(n))
    .sort();
  const input =
    process.argv.find((a) => a.startsWith("--file="))?.slice(7) || names.at(-1);
  if (!input) throw new Error("No database backup found");
  const file = path.resolve(directory, input);
  if (path.dirname(file) !== directory || !(await lstat(file)).isFile())
    throw new Error("Choose a dump inside BACKUP_DIR");
  const manifest = JSON.parse(await readFile(`${file}.json`, "utf8"));
  const manifestTables = Object.keys(manifest.counts);
  if (!manifestTables.length || manifestTables.some((t) => !tables.includes(t)))
    throw new Error("Invalid backup table manifest");
  if (checksum(await readFile(file)) !== manifest.checksum)
    throw new Error("Backup checksum mismatch");
  const target = verify
    ? `ccoc_verify_${randomBytes(6).toString("hex")}`
    : process.argv.find((a) => a.startsWith("--target="))?.slice(9);
  if (
    !target ||
    !/^ccoc_(verify|restore)_[a-z0-9_]+$/.test(target) ||
    target === database
  )
    throw new Error(
      "Restore requires a NEW target named ccoc_restore_<name>. The current database is preserved.",
    );
  let created = false;
  try {
    await run("createdb", [...connection, target]);
    created = true;
    await run("pg_restore", [
      ...connection,
      "--dbname",
      target,
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      file,
    ]);
    const result = await run("psql", [
      ...connection,
      "--dbname",
      target,
      "--no-psqlrc",
      "--tuples-only",
      "--no-align",
      "--command",
      countQuery(manifestTables),
    ]);
    const counts = Object.fromEntries(
      result
        .trim()
        .split(/\r?\n/)
        .map((line) => {
          const [table, count] = line.split("|");
          return [table, Number(count)];
        }),
    );
    if (manifestTables.some((t) => counts[t] !== manifest.counts[t]))
      throw new Error("Restored table counts differ from the backup manifest");
    if (!verify)
      await run("psql", [
        ...connection,
        "--dbname",
        target,
        "--no-psqlrc",
        "--set",
        "ON_ERROR_STOP=1",
        "--command",
        'DELETE FROM "Session"; DELETE FROM "GoogleViewerSession"; DELETE FROM "PasswordReset";',
      ]);
    console.log(
      JSON.stringify({
        ok: true,
        verified: true,
        file,
        target: verify ? "temporary verification database" : target,
        counts,
      }),
    );
  } finally {
    if (verify && created && /^ccoc_verify_[a-f0-9]{12}$/.test(target))
      await run("dropdb", [...connection, "--force", target]);
  }
}
try {
  if (process.argv.includes("--verify")) await restore(true);
  else if (process.argv.includes("--restore")) await restore(false);
  else await backup();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
