import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireGoogleViewer } from "@/lib/google";
import { summary, series, growth, type RecordData } from "@/lib/analytics";
import { z } from "zod";
import { comparisonWindow } from "@/lib/periods";
import { auditContext } from "@/lib/audit";
import { calendarDateSchema as date } from "@/lib/validation";
import { reserveExport } from "@/lib/rate-limit";
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const viewer = await requireGoogleViewer();
    const q = z
      .object({
        start: date,
        end: date,
        format: z.enum(["pdf", "excel"]),
        comparison: z
          .enum(["year", "month", "previousYear", "custom"])
          .default("year"),
        customStart: date.optional(),
        customEnd: date.optional(),
        period: z
          .enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"])
          .default("MONTHLY"),
      })
      .refine((d) => d.end >= d.start, "End date must follow start date")
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    const window = comparisonWindow(
      q.start,
      q.end,
      q.comparison,
      q.customStart ?? q.start,
      q.customEnd ?? q.end,
    );
    if (
      q.comparison === "custom" &&
      (!q.customStart || !q.customEnd || q.customEnd < q.customStart)
    )
      throw new Error("Valid custom comparison dates required");
    if (!(await reserveExport(viewer.id)))
      return NextResponse.json(
        { error: "Please wait a minute before downloading another report." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    const where = {
      deletedAt: null,
      serviceDate: { gte: new Date(q.start), lte: new Date(q.end) },
    };
    const [records, previous, settings] = await Promise.all([
      db.service.findMany({
        where,
        include: { attendance: true, giving: true },
        orderBy: { serviceDate: "asc" },
      }),
      db.service.findMany({
        where: {
          ...where,
          serviceDate: {
            gte: new Date(window.start),
            lte: new Date(window.end),
          },
        },
        include: { attendance: true, giving: true },
      }),
      db.appSetting.findMany(),
    ]);
    const serialize = (v: unknown) =>
      JSON.parse(JSON.stringify(v)) as RecordData[];
    const rows = serialize(records),
      stats = summary(rows),
      prior = summary(serialize(previous)),
      church =
        settings.find((s) => s.key === "churchName")?.value ??
        "City Church of Christ";
    const metrics: [string, number | string][] = [
      ["Total attendance", stats.totalAttendance],
      ["Average attendance per recorded service", stats.averageAttendance],
      ["Average weekly attendance", stats.averageWeeklyAttendance],
      ["Peak attendance", stats.peakAttendance],
      ["Lowest attendance", stats.lowestAttendance],
      [
        "Attendance growth (%)",
        (records.some((s) => s.attendance !== null) &&
        previous.some((s) => s.attendance !== null)
          ? growth(stats.totalAttendance, prior.totalAttendance)
          : null) ?? "No baseline",
      ],
      ["Total giving (PHP)", stats.totalGiving],
      ["Average giving per service (PHP)", stats.averageGiving],
      ["Average weekly giving (PHP)", stats.averageWeeklyGiving],
      ["Highest giving (PHP)", stats.highestGiving],
      ["Lowest giving (PHP)", stats.lowestGiving],
      [
        "Giving growth (%)",
        (records.some((s) => s.giving.length > 0) &&
        previous.some((s) => s.giving.length > 0)
          ? growth(stats.totalGiving, prior.totalGiving)
          : null) ?? "No baseline",
      ],
      ["Giving per attendee (PHP)", stats.givingPerAttendee],
    ];
    let buffer: Buffer;
    if (q.format === "excel") {
      const { default: ExcelJS } = await import("exceljs");
      const book = new ExcelJS.Workbook();
      book.creator = church;
      book.created = new Date();
      const s = book.addWorksheet("Summary");
      s.addRow([church]);
      s.addRow([`${q.period} report`, `${q.start} to ${q.end}`]);
      s.addRow([
        "Generated (Asia/Manila)",
        new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
      ]);
      s.addRow(["Metric", "Value"]);
      metrics.forEach((m) => s.addRow(m));
      s.columns = [{ width: 42 }, { width: 25 }];
      const att = book.addWorksheet("Attendance");
      att.addRow([
        "Date",
        "Service",
        "Total",
        "Adults",
        "Children",
        "Members",
        "Visitors",
      ]);
      for (const r of rows)
        att.addRow([
          r.serviceDate.slice(0, 10),
          r.serviceName,
          r.attendance?.totalAttendance ?? null,
          r.attendance?.adultCount ?? null,
          r.attendance?.childrenCount ?? null,
          r.attendance?.memberCount ?? null,
          r.attendance?.visitorCount ?? null,
        ]);
      const giving = book.addWorksheet("Giving");
      giving.addRow(["Date", "Service", "Amount (PHP)"]);
      for (const r of rows)
        for (const g of r.giving)
          giving.addRow([
            r.serviceDate.slice(0, 10),
            r.serviceName,
            Number(g.amount),
          ]);
      for (const sheet of [att, giving]) {
        sheet.columns.forEach((c) => (c.width = 24));
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        sheet.autoFilter = { from: "A1", to: sheet === att ? "G1" : "C1" };
      }
      for (const sheet of book.worksheets) {
        const row = sheet.getRow(sheet === s ? 4 : 1);
        row.font = { bold: true, color: { argb: "FFFFFFFF" } };
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF007F78" },
        };
        sheet.eachRow((row, i) => {
          if (i > 1)
            row.eachCell((c) => {
              if (typeof c.value === "number") c.numFmt = "#,##0.00";
            });
        });
      }
      buffer = Buffer.from(await book.xlsx.writeBuffer());
    } else {
      const { default: PDFDocument } = await import("pdfkit");
      const pdf = new PDFDocument({
        size: "A4",
        margin: 45,
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      const output = new Promise<Buffer>((resolve, reject) => {
        pdf.on("data", (c: Buffer) => chunks.push(c));
        pdf.on("end", () => resolve(Buffer.concat(chunks)));
        pdf.on("error", reject);
      });
      const font = process.env.REPORT_FONT_PATH || "C:/Windows/Fonts/arial.ttf";
      // Font is provisioned by the host, outside the application bundle.
      if (existsSync(/* turbopackIgnore: true */ font)) pdf.font(font);
      pdf.fillColor("#000000").fontSize(22).text(church);
      pdf
        .fillColor("#000000")
        .fontSize(16)
        .text(`${q.period.toLowerCase()} church performance report`);
      pdf
        .moveDown(0.5)
        .fontSize(10)
        .fillColor("#000000")
        .text(`Period: ${q.start} – ${q.end}`)
        .text(
          `Generated: ${new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Asia/Manila)`,
        );
      pdf.moveDown();
      for (const [name, value] of metrics) {
        pdf
          .fillColor("#000000")
          .fontSize(10)
          .text(name, { continued: true, width: 400 });
        pdf
          .fillColor("#000000")
          .text(
            typeof value === "number"
              ? value.toLocaleString("en-PH", { maximumFractionDigits: 2 })
              : value,
            { align: "right" },
          );
        pdf.moveDown(0.3);
      }
      pdf.addPage();
      pdf
        .fillColor("#000000")
        .fontSize(17)
        .text("Weekly attendance and giving");
      const points = series(rows);
      const chart = (
        key: "attendance" | "giving",
        title: string,
        top: number,
      ) => {
        pdf.fontSize(12).fillColor("#000000").text(title, 45, top);
        const bottom = top + 175,
          left = 55,
          width = 475,
          height = 130,
          max = Math.max(1, ...points.map((p) => p[key]));
        pdf
          .moveTo(left, top + 30)
          .lineTo(left, bottom)
          .lineTo(left + width, bottom)
          .strokeColor("#e5e5e5")
          .stroke();
        const step = width / Math.max(points.length, 1);
        for (let i = 0; i < points.length; i++) {
          const p = points[i],
            barHeight = (p[key] / max) * height;
          pdf
            .rect(
              left + i * step + step * 0.2,
              bottom - barHeight,
              step * 0.55,
              barHeight,
            )
            .fill(key === "attendance" ? "#c44f00" : "#007f78");
          pdf
            .fontSize(8)
            .fillColor("#000000")
            .text(p.name.slice(5), left + i * step, bottom + 8, {
              width: step,
              align: "center",
            });
          pdf.text(
            key === "giving"
              ? `PHP ${p[key].toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              : String(p[key]),
            left + i * step,
            bottom - barHeight - 14,
            { width: step, align: "center" },
          );
        }
        if (!points.length) pdf.text("No records in this period", 60, top + 80);
      };
      chart("attendance", "Attendance", 85);
      chart("giving", "Giving (PHP)", 345);
      const range = pdf.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        pdf.switchToPage(i);
        pdf
          .fontSize(8)
          .fillColor("#000000")
          .text(
            `${church} · Confidential leadership report · ${i + 1} / ${range.count}`,
            45,
            780,
            { lineBreak: false },
          );
      }
      pdf.end();
      buffer = await output;
    }
    await db.reportArtifact.create({
      data: {
        filename: `city-church-${q.start}-${q.end}-staff.${q.format === "excel" ? "xlsx" : "pdf"}`,
        month: q.start.slice(0, 7),
        scope: "staff",
        format: q.format === "excel" ? "xlsx" : "pdf",
        approved: false,
        checksum: createHash("sha256").update(buffer).digest("hex"),
        contents: new Uint8Array(buffer),
      },
    });
    await db.auditLog.create({
      data: {
        userId: user.id,
        ...auditContext(req),
        action: "EXPORT",
        entity: "Report",
        entityId: `${q.start}/${q.end}`,
        newData: {
          format: q.format,
          period: q.period,
          comparison: q.comparison,
        },
      },
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          q.format === "excel"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf",
        "Content-Disposition": `attachment; filename="city-church-report.${q.format === "excel" ? "xlsx" : "pdf"}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("Report export failed", e);
    const status =
      e instanceof Error &&
      ["UNAUTHENTICATED", "GOOGLE_SIGN_IN_REQUIRED"].includes(e.message)
        ? 401
        : 400;
    return NextResponse.json(
      {
        error:
          status === 401
            ? "Sign in with Google to download files."
            : "Unable to generate report. Check the selected dates.",
      },
      { status },
    );
  }
}
