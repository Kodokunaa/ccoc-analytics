import ExcelJS from "exceljs";
import { type RecordData, summary } from "./analytics";
import { monthReport, type TransparencyData } from "./transparency";
function header(sheet: ExcelJS.Worksheet, row: number) {
  const r = sheet.getRow(row);
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF007F78" } };
  r.height = 23;
}
function reportRows(report: ReturnType<typeof monthReport>) {
  const s = report.stats,
    p = report.previousStats;
  return [
    ["Services recorded", report.services, report.previousServices],
    ["Total attendance", s.totalAttendance, p.totalAttendance],
    [
      "Average attendance per recorded service",
      s.averageAttendance,
      p.averageAttendance,
    ],
    [
      "Average weekly attendance",
      s.averageWeeklyAttendance,
      p.averageWeeklyAttendance,
    ],
    ["Peak attendance", s.peakAttendance, p.peakAttendance],
    ["Lowest attendance", s.lowestAttendance, p.lowestAttendance],
    ["Total giving (PHP)", s.totalGiving, p.totalGiving],
    ["Average giving per service (PHP)", s.averageGiving, p.averageGiving],
    [
      "Average weekly giving (PHP)",
      s.averageWeeklyGiving,
      p.averageWeeklyGiving,
    ],
    ["Highest giving (PHP)", s.highestGiving, p.highestGiving],
    ["Lowest giving (PHP)", s.lowestGiving, p.lowestGiving],
    ["Giving per attendee (PHP)", s.givingPerAttendee, p.givingPerAttendee],
    ["Attendance growth (%)", report.attendanceGrowth ?? "No baseline", ""],
    ["Giving growth (%)", report.givingGrowth ?? "No baseline", ""],
    [
      "Data status",
      report.services ? "Recorded services only" : "No services recorded",
      report.previousServices
        ? "Recorded services only"
        : "No services recorded",
    ],
  ];
}
function monthlySheet(
  book: ExcelJS.Workbook,
  data: TransparencyData,
  month: string,
  name: string,
) {
  const r = monthReport(data.records, month),
    sheet = book.addWorksheet(name);
  sheet.columns = [{ width: 45 }, { width: 27 }, { width: 27 }, { width: 25 }];
  sheet.addRow([data.churchName]);
  sheet.addRow(["Monthly transparency report", r.title]);
  sheet.addRow([
    "Generated (Asia/Manila)",
    new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
  ]);
  sheet.addRow(["Metric", r.month, r.previousMonth]);
  header(sheet, 4);
  reportRows(r).forEach((row) => sheet.addRow(row));
  sheet.addRow([]);
  const heading = sheet.addRow([
    "Date",
    "Service",
    "Attendance",
    "Giving (PHP)",
  ]);
  header(sheet, heading.number);
  r.records.forEach((s) =>
    sheet.addRow([
      s.serviceDate.slice(0, 10),
      s.serviceName,
      s.attendance?.totalAttendance ?? "Not recorded",
      s.giving.reduce((sum, g) => sum + Number(g.amount), 0),
    ]),
  );
  if (!r.records.length) sheet.addRow(["No services recorded in this month"]);
  sheet.views = [{ state: "frozen", ySplit: 4 }];
  return sheet;
}
function rawSheets(book: ExcelJS.Workbook, rows: RecordData[]) {
  const att = book.addWorksheet("Attendance"),
    giving = book.addWorksheet("Giving");
  att.addRow([
    "Date",
    "Service",
    "Total attendance",
    "Adults",
    "Children",
    "Members",
    "Visitors",
  ]);
  giving.addRow(["Date", "Service", "Amount (PHP)"]);
  for (const r of rows) {
    att.addRow([
      r.serviceDate.slice(0, 10),
      r.serviceName,
      r.attendance?.totalAttendance ?? "Not recorded",
      r.attendance?.adultCount ?? "",
      r.attendance?.childrenCount ?? "",
      r.attendance?.memberCount ?? "",
      r.attendance?.visitorCount ?? "",
    ]);
    for (const g of r.giving)
      giving.addRow([
        r.serviceDate.slice(0, 10),
        r.serviceName,
        Number(g.amount),
      ]);
  }
  for (const sheet of [att, giving]) {
    sheet.columns.forEach((c) => (c.width = 24));
    header(sheet, 1);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: "A1", to: sheet === att ? "G1" : "C1" };
  }
}
export async function publicWorkbook(
  data: TransparencyData,
  scope: "data" | "month" | "year",
  month: string,
  year: number,
  sources: Record<string, { data: TransparencyData }> = {},
) {
  const book = new ExcelJS.Workbook();
  book.creator = data.churchName;
  book.created = new Date();
  book.description =
    "Public transparency report. Contains aggregate attendance and giving; no private notes or staff identities.";
  if (scope === "year") {
    const sheet = book.addWorksheet("Annual summary");
    sheet.columns = [
      { width: 25 },
      { width: 20 },
      { width: 20 },
      { width: 25 },
      { width: 25 },
      { width: 25 },
      { width: 25 },
    ];
    sheet.addRow([data.churchName, year]);
    sheet.addRow([
      "Month",
      "Services",
      "Attendance",
      "Giving (PHP)",
      "Previous month attendance",
      "Attendance growth (%)",
      "Giving growth (%)",
    ]);
    header(sheet, 2);
    const reports = data.months.map((r) =>
      sources[r.month]
        ? monthReport(sources[r.month].data.records, r.month)
        : r,
    );
    for (const r of reports)
      sheet.addRow([
        r.title,
        r.services,
        r.stats.totalAttendance,
        r.stats.totalGiving,
        r.previousStats.totalAttendance,
        r.attendanceGrowth ?? "No baseline",
        r.givingGrowth ?? "No baseline",
      ]);
    const annual = summary(
      reports.flatMap(
        (r) =>
          monthReport((sources[r.month]?.data ?? data).records, r.month)
            .records,
      ),
    );
    sheet.addRow([
      "Year total",
      reports.reduce((s, r) => s + r.services, 0),
      annual.totalAttendance,
      annual.totalGiving,
    ]);
    for (const r of data.months)
      monthlySheet(
        book,
        sources[r.month]?.data ?? data,
        r.month,
        new Date(`${r.month}-01`).toLocaleDateString("en-PH", {
          month: "long",
          timeZone: "Asia/Manila",
        }),
      );
  } else {
    monthlySheet(book, data, month, "Summary");
    rawSheets(book, monthReport(data.records, month).records);
  }
  for (const sheet of book.worksheets)
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        if (typeof cell.value === "number") cell.numFmt = "#,##0.00";
        cell.alignment = { vertical: "middle", wrapText: true };
      }),
    );
  return Buffer.from(await book.xlsx.writeBuffer());
}
