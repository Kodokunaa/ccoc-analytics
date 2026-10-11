import { summary, growth, type RecordData } from "./analytics";
import { comparisonWindow, periodWindow } from "./periods";
export const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-PH", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
export function monthReport(records: RecordData[], month: string) {
  const window = periodWindow(`${month}-01`, "MONTHLY"),
    prior = comparisonWindow(window.start, window.end, "month", "", "");
  const inRange = (start: string, end: string) =>
    records.filter(
      (s) =>
        s.serviceDate.slice(0, 10) >= start &&
        s.serviceDate.slice(0, 10) <= end,
    );
  const current = inRange(window.start, window.end),
    previous = inRange(prior.start, prior.end),
    stats = summary(current),
    previousStats = summary(previous);
  return {
    month,
    title: monthName(month),
    window,
    previousMonth: prior.start.slice(0, 7),
    records: current,
    previousRecords: previous,
    services: current.length,
    previousServices: previous.length,
    stats,
    previousStats,
    attendanceGrowth:
      previous.some((r) => r.attendance !== null) &&
      current.some((r) => r.attendance !== null)
        ? growth(stats.totalAttendance, previousStats.totalAttendance)
        : null,
    givingGrowth:
      previous.some((r) => r.giving.length > 0) &&
      current.some((r) => r.giving.length > 0)
        ? growth(stats.totalGiving, previousStats.totalGiving)
        : null,
  };
}
