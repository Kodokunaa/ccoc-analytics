import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireGoogleViewer } from "@/lib/google";
import { reserveExport } from "@/lib/rate-limit";
import {
  importHeaders,
  importRecordsSchema,
  checkWorkbookZip,
} from "@/lib/import-data";
import { lockMonths, monthKey } from "@/lib/report-lock";
import { auditContext } from "@/lib/audit";
import { z } from "zod";
const MAX = 4 * 1024 * 1024;
async function limitedBody(req: NextRequest) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("No import data received.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX) {
        await reader.cancel();
        throw new Error("Import must be under 4 MB.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export async function GET() {
  try {
    await requireUser(true);
    const viewer = await requireGoogleViewer();
    if (!(await reserveExport(viewer.id)))
      return NextResponse.json(
        { error: "Please wait a minute." },
        { status: 429 },
      );
    const ExcelJS = (await import("exceljs")).default,
      book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Sunday services");
    sheet.addRow(importHeaders);
    sheet.columns = importHeaders.map(() => ({ width: 20 }));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    book
      .addWorksheet("Instructions")
      .addRows([
        ["One row per Sunday. Active Sunday dates must be unique."],
        ["Date: YYYY-MM-DD, 1990–2100. Sunday services only."],
        ["Service: name (optional; defaults to Sunday service)."],
        [
          "Attendance and demographic counts: whole numbers. Blank attendance means not recorded.",
        ],
        [
          "Blank demographic counts default to 0. Counts must not exceed attendance.",
        ],
        [
          "Giving (PHP): nonnegative with at most two decimals. Blank means not recorded; 0 means recorded zero.",
        ],
        [
          "Private notes are visible only to staff. Formulas are not supported.",
        ],
        [
          "Import adds records; it never overwrites existing Sunday dates. Maximum 1,000 rows / 4 MB.",
        ],
      ]);
    return new NextResponse(new Uint8Array(await book.xlsx.writeBuffer()), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          "attachment; filename=church-sunday-import-template.xlsx",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error && e.message === "GOOGLE_SIGN_IN_REQUIRED"
            ? "Sign in with Google to download the template."
            : "Unable to download template",
      },
      { status: 401 },
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new Error("FORBIDDEN");
    const user = await requireUser(true);
    const body = await limitedBody(req);
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await new Response(new Uint8Array(body), {
        headers: { "Content-Type": req.headers.get("content-type")! },
      }).formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("Choose an XLSX file.");
      const buffer = Buffer.from(await file.arrayBuffer());
      checkWorkbookZip(buffer);
      const ExcelJS = (await import("exceljs")).default,
        book = new ExcelJS.Workbook();
      await book.xlsx.load(
        buffer as unknown as Parameters<typeof book.xlsx.load>[0],
      );
      const sheet = book.getWorksheet("Sunday services") ?? book.worksheets[0];
      if (!sheet || sheet.rowCount > 1001)
        throw new Error("Use at most 1,000 service rows.");
      if (
        importHeaders.some((h, i) => sheet.getRow(1).getCell(i + 1).value !== h)
      )
        throw new Error("Workbook headers must match the import template.");
      const rows: unknown[] = [];
      for (let n = 2; n <= sheet.rowCount; n++) {
        const cells = importHeaders.map(
          (_, i) => sheet.getRow(n).getCell(i + 1).value,
        );
        if (cells.every((v) => v === null || v === "")) continue;
        if (
          cells.some(
            (v) => v !== null && typeof v === "object" && !(v instanceof Date),
          )
        )
          throw new Error(
            `Row ${n}: formulas and rich text are not supported.`,
          );
        const [
          date,
          name,
          total,
          adults,
          children,
          members,
          visitors,
          giving,
          notes,
        ] = cells;
        rows.push({
          serviceDate:
            date instanceof Date
              ? date.toISOString().slice(0, 10)
              : String(date ?? ""),
          serviceName: String(name || "Sunday service"),
          notes: String(notes ?? ""),
          ...(total !== null && total !== ""
            ? {
                attendance: {
                  totalAttendance: total,
                  adultCount: adults || 0,
                  childrenCount: children || 0,
                  memberCount: members || 0,
                  visitorCount: visitors || 0,
                },
              }
            : {}),
          giving: giving !== null && giving !== "" ? [{ amount: giving }] : [],
        });
      }
      const records = importRecordsSchema.parse(rows);
      const existing = await db.service.findMany({
        where: {
          deletedAt: null,
          serviceDate: { in: records.map((r) => new Date(r.serviceDate)) },
        },
        select: { serviceDate: true },
      });
      const locked = await db.reportMonth.findMany({
        where: {
          month: { in: records.map((r) => monthKey(r.serviceDate)) },
          approvedAt: { not: null },
        },
        select: { month: true },
      });
      return NextResponse.json(
        {
          records,
          conflicts: existing.map((s) =>
            s.serviceDate.toISOString().slice(0, 10),
          ),
          locked: locked.map((r) => r.month),
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const records = importRecordsSchema.parse(
      JSON.parse(body.toString()).records,
    );
    await db.$transaction(
      async (tx) => {
        await lockMonths(
          tx,
          records.map((r) => monthKey(r.serviceDate)),
        );
        for (const r of records) {
          const { attendance, giving, ...fields } = r;
          await tx.service.create({
            data: {
              ...fields,
              serviceDate: new Date(r.serviceDate),
              createdBy: user.id,
              ...(attendance
                ? {
                    attendance: {
                      create: { ...attendance, createdBy: user.id },
                    },
                  }
                : {}),
              ...(giving?.length
                ? {
                    giving: {
                      create: giving.map((g) => ({ ...g, createdBy: user.id })),
                    },
                  }
                : {}),
            },
          });
        }
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "CREATE",
            entity: "service-import",
            entityId: records[0].serviceDate,
            newData: {
              count: records.length,
              dates: records.map((r) => r.serviceDate),
            },
            ...auditContext(req),
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 60000,
      },
    );
    return NextResponse.json({ ok: true, count: records.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? e.issues
                .map(
                  (i) =>
                    `Row ${Number(i.path[0]) + 2}: ${i.path.slice(1).join(".")} ${i.message}`,
                )
                .join("; ")
            : e instanceof Prisma.PrismaClientKnownRequestError
              ? "An active Sunday date already exists or another update occurred. Nothing was imported."
              : ["FORBIDDEN", "UNAUTHENTICATED"].includes(msg)
                ? "Administrator sign-in required."
                : msg.startsWith("Row ") ||
                    [
                      "Import must be under 4 MB.",
                      "No import data received.",
                      "Choose an XLSX file.",
                      "Use a valid XLSX workbook.",
                      "Workbook has too many entries.",
                      "Expanded workbook must be under 20 MB.",
                      "Invalid workbook archive.",
                      "Use at most 1,000 service rows.",
                      "Workbook headers must match the import template.",
                      "This month is approved and locked. An administrator must reopen it first.",
                    ].includes(msg)
                  ? msg
                  : "Unable to import this workbook. Nothing was imported.",
      },
      {
        status:
          msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 400,
      },
    );
  }
}
