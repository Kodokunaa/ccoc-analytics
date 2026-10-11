import { test } from "node:test";
import assert from "node:assert/strict";
import { monthCompleteness } from "../lib/completeness";
import { series, type RecordData } from "../lib/analytics";
import { importRecordsSchema, checkWorkbookZip } from "../lib/import-data";
import { serviceSchema } from "../lib/validation";
import { presentationSlides } from "../lib/presentation-model";
import type { TransparencyData } from "../lib/transparency";
const record = (date: string): RecordData => ({
  id: date,
  serviceDate: date,
  serviceName: "Sunday",
  serviceType: "SUNDAY_SERVICE",
  attendance: {
    totalAttendance: 0,
    adultCount: 0,
    childrenCount: 0,
    memberCount: 0,
    visitorCount: 0,
  },
  giving: [{ amount: 0 }],
});
test("PowerPoint distinguishes missing giving from explicitly recorded zero", () => {
  const data: TransparencyData = {
    records: [{ ...record("2024-02-04"), giving: [] }],
    months: [],
    years: [2024],
    latestMonth: "2024-02",
    churchName: "Church",
    churchAddress: "",
    logo: "",
    lastUpdated: null,
  };
  const missing = presentationSlides(data, data, "2024-02");
  assert.equal(missing[3].rows![1][1], "Not recorded");
  assert.equal(missing[4].empty, "No giving recorded for this month");
  assert.equal(missing[5].rows![1][1], "Not recorded");
  const zero = presentationSlides(
    { ...data, records: [record("2024-02-04")] },
    data,
    "2024-02",
  );
  assert.equal(zero[4].chart!.values[0], 0);
  assert.notEqual(zero[3].rows![1][1], "Not recorded");
});
test("Completeness distinguishes missing Sunday records, explicit zero, and future Sundays", () => {
  const rows = ["2024-02-04", "2024-02-11", "2024-02-18", "2024-02-25"].map(
    record,
  );
  assert.equal(monthCompleteness(rows, "2024-02", "2024-03-01").complete, true);
  assert.equal(monthCompleteness(rows, "2024-02", "2024-02-12").ended, false);
  assert.equal(
    monthCompleteness(rows.slice(0, 2), "2024-02", "2024-02-12").days.filter(
      (d) => d.future,
    ).length,
    2,
  );
  assert.equal(
    monthCompleteness(
      [{ ...rows[0], attendance: null, giving: [] }, ...rows.slice(1)],
      "2024-02",
      "2024-03-01",
    ).complete,
    false,
  );
});
test("Quarterly and yearly grouping preserve cents and year boundaries", () => {
  const rows = [
    record("2024-03-31"),
    record("2024-04-07"),
    record("2025-01-05"),
  ].map((r, i) => ({ ...r, giving: [{ amount: (i + 1) / 100 }] }));
  assert.deepEqual(
    series(rows, "quarterly").map((r) => r.name),
    ["2024-Q1", "2024-Q2", "2025-Q1"],
  );
  assert.deepEqual(
    series(rows, "yearly").map((r) => r.giving),
    [0.03, 0.03],
  );
});
test("Sunday imports reject weekdays, duplicate dates, malformed ZIPs and excessive rows", () => {
  assert.equal(
    serviceSchema.safeParse({
      serviceDate: "2024-02-05",
      serviceName: "Monday",
    }).success,
    false,
  );
  const row = { serviceDate: "2024-02-04", serviceName: "Sunday" };
  assert.equal(importRecordsSchema.safeParse([row, row]).success, false);
  assert.equal(
    importRecordsSchema.safeParse(Array.from({ length: 1001 }, () => row))
      .success,
    false,
  );
  assert.throws(() => checkWorkbookZip(Buffer.from("not a workbook")));
});
