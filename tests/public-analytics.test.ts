import { test } from "node:test";
import assert from "node:assert/strict";
import { monthReport } from "../lib/public-analytics";
import { summary, series, type RecordData } from "../lib/analytics";
const service = (
  date: string,
  attendance: number,
  giving: number,
): RecordData => ({
  id: date,
  serviceDate: date,
  serviceName: "Worship",
  serviceType: "SUNDAY_SERVICE",
  attendance: {
    totalAttendance: attendance,
    adultCount: 0,
    childrenCount: 0,
    memberCount: 0,
    visitorCount: 0,
  },
  giving: [
    {
      amount: giving,
    },
  ],
});
test("Monthly public reports compare immediately previous month across year boundary", () => {
  const records = [
    service("2025-12-28", 100, 1000),
    service("2026-01-04", 110, 900),
  ];
  const r = monthReport(records, "2026-01");
  assert.equal(r.previousMonth, "2025-12");
  assert.equal(r.attendanceGrowth, 10);
  assert.equal(r.givingGrowth, -10);
  assert.equal(r.services, 1);
});
test("Missing or zero previous data is not represented as invented growth", () => {
  assert.equal(
    monthReport([service("2026-01-04", 10, 100)], "2026-01").attendanceGrowth,
    null,
  );
  assert.equal(
    monthReport(
      [service("2025-12-28", 0, 0), service("2026-01-04", 10, 100)],
      "2026-01",
    ).attendanceGrowth,
    null,
  );
  assert.equal(monthReport([], "2026-02").services, 0);
});
test("Missing attendance stays distinct from zero and money totals preserve cents", () => {
  const records = [
    service("2025-12-28", 10, 0.1),
    service("2026-01-04", 0, 0.2),
  ];
  records[1].attendance = null;
  assert.equal(monthReport(records, "2026-01").attendanceGrowth, null);
  assert.equal(summary(records).totalGiving, 0.3);
  records[1].serviceDate = records[0].serviceDate;
  assert.equal(series(records)[0].giving, 0.3);
});
test("Giving growth requires recorded giving in both months, including explicit zero", () => {
  const previous = service("2025-12-28", 10, 100);
  const current = service("2026-01-04", 10, 0);
  assert.equal(monthReport([previous, current], "2026-01").givingGrowth, -100);
  assert.equal(
    monthReport([previous, { ...current, giving: [] }], "2026-01").givingGrowth,
    null,
  );
  assert.equal(
    monthReport([{ ...previous, giving: [] }, current], "2026-01").givingGrowth,
    null,
  );
  assert.equal(
    monthReport(
      [
        { ...previous, giving: [] },
        { ...current, giving: [] },
      ],
      "2026-01",
    ).givingGrowth,
    null,
  );
  assert.equal(
    monthReport([service("2025-12-28", 10, 0), current], "2026-01")
      .givingGrowth,
    0,
  );
});
