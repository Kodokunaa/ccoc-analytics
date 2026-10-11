import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summary,
  growth,
  pearson,
  series,
  comparisonSeries,
  type RecordData,
} from "../lib/analytics";
import { comparisonWindow, periodWindow } from "../lib/periods";
import { attendanceSchema, serviceSchema } from "../lib/validation";
function sample(
  year: number,
  attendance: number[],
  giving: number[],
): RecordData[] {
  return attendance.map((n, i) => ({
    id: String(i),
    serviceDate: `${year}-01-${String(4 + i * 7).padStart(2, "0")}T00:00:00.000Z`,
    serviceType: "SUNDAY_SERVICE",
    serviceName: "Sunday Worship",
    attendance: {
      totalAttendance: n,
      adultCount: 0,
      childrenCount: 0,
      memberCount: 0,
      visitorCount: 0,
    },
    giving: [
      {
        amount: giving[i],
      },
    ],
  }));
}
test("January requirements match calculated values", () => {
  const now = summary(sample(2026, [41, 52, 67, 63], [4320, 2190, 2765, 4200])),
    prev = summary(sample(2025, [53, 47, 50, 50], [2860, 2748, 3505, 7165]));
  assert.equal(now.totalAttendance, 223);
  assert.equal(now.averageAttendance, 55.75);
  assert.equal(now.averageWeeklyAttendance, 55.75);
  assert.equal(now.peakAttendance, 67);
  assert.equal(now.lowestAttendance, 41);
  assert.equal(now.totalGiving, 13475);
  assert.equal(now.averageGiving, 3368.75);
  assert.equal(now.averageWeeklyGiving, 3368.75);
  assert.equal(prev.totalGiving, 16278);
  assert.equal(growth(now.totalAttendance, prev.totalAttendance), 11.5);
  assert.ok(
    Math.abs(growth(now.totalGiving, prev.totalGiving)! + 17.21956) < 0.001,
  );
  assert.ok(Math.abs(now.givingPerAttendee - 60.426) < 0.001);
});
test("No data, no baseline, and no variation are safe", () => {
  assert.equal(summary([]).totalAttendance, 0);
  assert.equal(growth(0, 0), 0);
  assert.equal(growth(2, 0), null);
  assert.equal(
    pearson([
      { attendance: 1, giving: 1 },
      { attendance: 1, giving: 2 },
    ]),
    null,
  );
  assert.equal(
    pearson([
      { attendance: 1, giving: 2 },
      { attendance: 2, giving: 4 },
    ]),
    1,
  );
});
test("Grouping includes multiple services in one week", () => {
  const data = sample(2026, [41, 52], [100, 200]);
  data[1].serviceDate = data[0].serviceDate;
  assert.equal(series(data).length, 1);
  assert.equal(summary(data).averageWeeklyAttendance, 93);
});
test("Missing attendance differs from recorded zero", () => {
  const data = sample(2026, [0, 20], [0, 100]);
  data[0].attendance = null;
  assert.equal(summary(data).averageAttendance, 20);
  assert.equal(summary(data).lowestAttendance, 20);
});
test("Invalid breakdowns and calendar dates are rejected", () => {
  assert.equal(
    attendanceSchema.safeParse({
      totalAttendance: 10,
      adultCount: 9,
      childrenCount: 2,
      memberCount: 0,
      visitorCount: 0,
    }).success,
    false,
  );
  assert.equal(
    serviceSchema.safeParse({
      serviceDate: "2026-02-30",
      serviceName: "Test",
      serviceType: "OTHER",
    }).success,
    false,
  );
});
test("Date windows clamp leap days and cross year boundaries", () => {
  assert.deepEqual(
    comparisonWindow("2024-02-01", "2024-02-29", "year", "", ""),
    { start: "2023-02-01", end: "2023-02-28" },
  );
  assert.deepEqual(periodWindow("2026-12-30", "QUARTERLY"), {
    start: "2026-10-01",
    end: "2026-12-31",
  });
  assert.deepEqual(
    comparisonWindow("2026-01-01", "2026-01-31", "month", "", ""),
    { start: "2025-12-01", end: "2025-12-31" },
  );
});
test("Missing comparison months do not shift data", () => {
  const current = sample(2026, [10], [100]);
  current[0].serviceDate = "2026-03-01";
  const prior = sample(2025, [20], [200]);
  prior[0].serviceDate = "2025-02-01";
  const result = comparisonSeries(
    current,
    prior,
    "2026-01-01",
    "2025-01-01",
    "monthly",
  );
  assert.equal(result[0].previousAttendance, undefined);
});
