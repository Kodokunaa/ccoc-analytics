import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { publicWorkbook } from "../lib/public-workbook";
import { monthReport } from "../lib/public-analytics";
import type { TransparencyData } from "../lib/transparency";
import type { RecordData } from "../lib/analytics";
const records: RecordData[] = [
  {
    id: "attendance",
    serviceDate: "2026-06-07",
    serviceType: "SUNDAY_SERVICE",
    serviceName: "Sunday",
    attendance: {
      totalAttendance: 20,
      adultCount: 0,
      childrenCount: 0,
      memberCount: 0,
      visitorCount: 0,
    },
    giving: [],
  },
  {
    id: "giving",
    serviceDate: "2026-06-14",
    serviceType: "SUNDAY_SERVICE",
    serviceName: "Sunday",
    attendance: null,
    giving: [{ amount: "10.25" }],
  },
];
function data(rows = records): TransparencyData {
  return {
    campaign: [
      {
        id: "campaign",
        year: 2026,
        month: 6,
        label: "Campaign should stay separate",
        amount: "99999",
      },
    ],
    records: rows,
    months: Array.from({ length: 12 }, (_, i) =>
      monthReport(rows, `2026-${String(i + 1).padStart(2, "0")}`),
    ),
    years: [2026],
    latestMonth: "2026-06",
    churchName: "City Church of Christ",
    churchAddress: "",
    logo: "",
    lastUpdated: null,
  };
}
async function workbook(buffer: Buffer) {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    buffer as unknown as Parameters<typeof book.xlsx.load>[0],
  );
  return book;
}
test("workbooks preserve missing metrics, recorded-service averages and separate campaign money", async () => {
  const book = await workbook(
    await publicWorkbook(data(), "month", "2026-06", 2026),
  );
  const sheet = book.getWorksheet("Summary")!;
  const metric = (label: string) =>
    sheet
      .getRows(1, sheet.rowCount)!
      .find((r) => r.getCell(1).value === label)!;
  assert.equal(metric("Average weekly attendance").getCell(2).value, 20);
  assert.equal(
    metric("Average giving per service (PHP)").getCell(2).value,
    10.25,
  );
  assert.equal(metric("Lowest giving (PHP)").getCell(2).value, 10.25);
  assert.equal(metric("Total attendance").getCell(2).numFmt, "#,##0");
  assert.equal(metric("Total giving (PHP)").getCell(2).numFmt, "#,##0.00");
  assert.equal(
    metric("Giving per attendee (PHP)").getCell(2).value,
    "Not available",
  );
  assert.equal(metric("Total attendance").getCell(3).value, "Not recorded");
  assert.equal(
    book.getWorksheet("Attendance")!.getCell("C3").value,
    "Not recorded",
  );
  assert.equal(book.getWorksheet("Attendance")!.getCell("D2").numFmt, "#,##0");
  assert.ok(!JSON.stringify(book.model).includes("99999"));
  const rawRows = sheet
    .getRows(1, sheet.rowCount)!
    .filter((r) => r.getCell(1).value === "2026-06-07");
  assert.equal(rawRows[0].getCell(4).value, "Not recorded");
});
test("annual totals and monthly sheets consistently honor approved snapshots", async () => {
  const approved = data([{ ...records[1], giving: [{ amount: "3.75" }] }]);
  const book = await workbook(
    await publicWorkbook(data(), "year", "2026-06", 2026, {
      "2026-06": { data: approved },
    }),
  );
  assert.equal(book.worksheets.length, 13);
  const annual = book.getWorksheet("Annual summary")!;
  assert.equal(annual.getCell("D8").value, 3.75);
  assert.equal(annual.getCell("D15").value, 3.75);
  assert.equal(annual.getCell("C8").value, "Not recorded");
  const june = book.getWorksheet("June")!;
  assert.equal(june.getCell("B11").value, 3.75);
});
