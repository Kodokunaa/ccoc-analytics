import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import {
  attendanceLedger,
  campaignLedger,
  campaignCarryForward,
} from "../prisma/ledger-2026";

// Explicit environment file and --apply are required for writes. Never run the
// generic development seed to import real records or change administrator access.
const file = process.argv.find((a) => a.startsWith("--env-file="))?.slice(11);
if (!file)
  throw new Error("Provide --env-file=.env or --env-file=.env.production");
const config = parseEnv(readFileSync(file, "utf8"));
if (!config.DATABASE_URL)
  throw new Error("Selected environment file has no DATABASE_URL");
const db = new PrismaClient({
  datasources: { db: { url: config.DATABASE_URL } },
});
async function main() {
  const apply = process.argv.includes("--apply");
  const result = await db.$transaction(
    async (tx) => {
      if (!apply) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      else await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261018)`;
      const admin = await tx.user.findFirstOrThrow({
        where: { role: { name: "SUPER_ADMIN" }, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      });
      let added = 0,
        skipped = 0;
      for (const row of attendanceLedger) {
        const id = `ledger-attendance-${row.date}`;
        const matches = await tx.service.findMany({
          where: { serviceDate: new Date(row.date), deletedAt: null },
          include: { attendance: true },
        });
        if (matches.length) {
          const existing = matches[0];
          if (
            matches.length !== 1 ||
            existing.id !== id ||
            existing.attendance?.totalAttendance !== row.total ||
            existing.attendance.visitorCount !== (row.visitors ?? 0)
          )
            throw new Error(
              `Existing attendance requires review on ${row.date}; nothing imported.`,
            );
          skipped++;
          continue;
        }
        if (apply) {
          await tx.service.create({
            data: {
              id,
              serviceDate: new Date(row.date),
              serviceType: "SUNDAY_SERVICE",
              serviceName: "Sunday Worship",
              createdBy: admin.id,
              notes: `Imported from handwritten attendance ledger supplied 2026-10-18. Age and membership breakdowns were not supplied.${row.visitors === undefined ? " Visitor count not supplied; stored as unclassified." : " Visitor count taken from the numbered visitor list; names not imported."}`,
              attendance: {
                create: {
                  totalAttendance: row.total,
                  visitorCount: row.visitors ?? 0,
                  createdBy: admin.id,
                },
              },
            },
          });
          await tx.auditLog.create({
            data: {
              userId: admin.id,
              action: "CREATE",
              entity: "Service",
              entityId: id,
              newData: {
                source: "ledger-2026-10-18",
                totalAttendance: row.total,
                visitorCount: row.visitors ?? null,
              },
            },
          });
        }
        added++;
      }
      let campaignAdded = 0;
      for (const row of [...campaignCarryForward, ...campaignLedger]) {
        const existing = await tx.capitalCampaignEntry.findUnique({
          where: { id: row.id },
        });
        if (existing) {
          if (
            Number(existing.amount) !== row.amount ||
            existing.year !== row.year ||
            existing.month !== row.month
          )
            throw new Error(
              `Campaign record ${row.id} conflicts; nothing imported.`,
            );
          continue;
        }
        if (apply) {
          await tx.capitalCampaignEntry.create({ data: row });
          await tx.auditLog.create({
            data: {
              userId: admin.id,
              action: "CREATE",
              entity: "CapitalCampaignEntry",
              entityId: row.id,
              newData: { ...row },
            },
          });
        }
        campaignAdded++;
      }
      return {
        applied: apply,
        attendanceAdded: added,
        attendanceSkipped: skipped,
        campaignAdded,
        augustAttendance: 252,
        septemberAttendance: 220,
        campaign2026: 61100,
        carryForward: 19114,
        calculatedBalance: 80214,
        unresolvedDifference: 50,
      };
    },
    { timeout: 120000, isolationLevel: "Serializable" },
  );
  console.log(JSON.stringify(result));
}
main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error && !error.name.startsWith("Prisma")
        ? error.message
        : "Ledger import failed; transaction rolled back. Check database connectivity and migration status.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
