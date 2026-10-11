import { currency, growth, series, summary } from "./analytics";
import { monthName, monthReport } from "./public-analytics";
import type { TransparencyData } from "./transparency";
export type ReportSlide = {
  title: string;
  period: string;
  note: string;
  rows?: string[][];
  widths?: number[];
  chart?: {
    metric: "attendance" | "giving";
    labels: string[];
    values: number[];
  };
  empty?: string;
  caption?: string;
};
const num = (v: number) =>
  new Intl.NumberFormat("en-PH", { maximumFractionDigits: 2 }).format(v);
const change = (v: number | null) =>
  v === null ? "No baseline" : `${v > 0 ? "+" : ""}${num(v)}%`;
export function presentationSlides(
  data: TransparencyData,
  previousYear: TransparencyData,
  month: string,
): ReportSlide[] {
  const r = monthReport(data.records, month),
    oldMonth = `${Number(month.slice(0, 4)) - 1}-${month.slice(5)}`;
  const oldRecords = previousYear.records.filter((s) =>
      s.serviceDate.startsWith(oldMonth),
    ),
    oldStats = summary(oldRecords);
  const recorded = r.records.some((s) => s.attendance !== null);
  const givingRecorded = r.records.some((s) => s.giving.length > 0);
  const givingStats = summary(r.records.filter((s) => s.giving.length > 0));
  const period = monthName(month);
  const note = `Source: active service records for ${month}. Missing entries are omitted from graphs and per-recorded-service averages, rather than treated as recorded zero. Giving is in PHP. Private notes and staff identities are excluded.`;
  const slides: ReportSlide[] = [];
  for (const metric of ["attendance", "giving"] as const) {
    const title = metric === "attendance" ? "Attendance" : "Giving";
    const rows =
      metric === "attendance"
        ? [
            ["Metric", "Value"],
            [
              "Total attendance",
              recorded ? num(r.stats.totalAttendance) : "Not recorded",
            ],
            [
              "Average per recorded service",
              recorded ? num(r.stats.averageAttendance) : "Not recorded",
            ],
            [
              "Average weekly attendance",
              recorded ? num(r.stats.averageWeeklyAttendance) : "Not recorded",
            ],
            [
              "Peak attendance",
              recorded ? num(r.stats.peakAttendance) : "Not recorded",
            ],
            [
              "Lowest attendance",
              recorded ? num(r.stats.lowestAttendance) : "Not recorded",
            ],
            ["Services recorded", String(r.services)],
          ]
        : [
            ["Metric", "Value (PHP)"],
            [
              "Total giving",
              givingRecorded
                ? currency(givingStats.totalGiving)
                : "Not recorded",
            ],
            [
              "Average per recorded service",
              givingRecorded
                ? currency(givingStats.averageGiving)
                : "Not recorded",
            ],
            [
              "Average weekly recorded giving",
              givingRecorded
                ? currency(givingStats.averageWeeklyGiving)
                : "Not recorded",
            ],
            [
              "Highest giving per service",
              givingRecorded
                ? currency(givingStats.highestGiving)
                : "Not recorded",
            ],
            [
              "Lowest giving per service",
              givingRecorded
                ? currency(givingStats.lowestGiving)
                : "Not recorded",
            ],
            [
              "Giving per attendee",
              recorded && r.stats.totalAttendance && givingRecorded
                ? currency(r.stats.givingPerAttendee)
                : !givingRecorded
                  ? "Not recorded"
                  : "No attendance baseline",
            ],
          ];
    slides.push({
      title: `${title} numbers`,
      period,
      note,
      rows,
      widths: [8, 4],
    });
    const weekly = series(
      r.records.filter((s) =>
        metric === "attendance" ? s.attendance !== null : s.giving.length > 0,
      ),
    );
    slides.push({
      title: `${title} graph`,
      period: `${period} · Weekly totals${metric === "giving" ? " (PHP)" : ""}`,
      note,
      ...((metric === "attendance" && !recorded) ||
      (metric === "giving" && !givingRecorded)
        ? {
            empty:
              metric === "attendance"
                ? "No attendance recorded for this month"
                : "No giving recorded for this month",
          }
        : {
            chart: {
              metric,
              labels: weekly.map((w) => `Week of ${w.name}`),
              values: weekly.map((w) => w[metric]),
            },
          }),
    });
    const current =
      metric === "attendance" ? r.stats.totalAttendance : r.stats.totalGiving;
    const previous =
      metric === "attendance"
        ? r.previousStats.totalAttendance
        : r.previousStats.totalGiving;
    const yearly =
      metric === "attendance" ? oldStats.totalAttendance : oldStats.totalGiving;
    const hasCurrent = metric === "attendance" ? recorded : givingRecorded;
    const hasPrevious =
      metric === "attendance"
        ? r.previousRecords.some((s) => s.attendance !== null)
        : r.previousRecords.some((s) => s.giving.length > 0);
    const hasYearly =
      metric === "attendance"
        ? oldRecords.some((s) => s.attendance !== null)
        : oldRecords.some((s) => s.giving.length > 0);
    const format = metric === "attendance" ? num : currency;
    slides.push({
      title: `${title} comparison`,
      period: `${period} · Last month and the same month last year`,
      note,
      widths: [6, 3, 3],
      rows: [
        [
          "Period",
          metric === "attendance" ? "Attendance" : "Giving (PHP)",
          "Change",
        ],
        [
          `Current · ${period}`,
          hasCurrent ? format(current) : "Not recorded",
          "—",
        ],
        [
          `Last month · ${monthName(r.previousMonth)}`,
          hasPrevious ? format(previous) : "Not recorded",
          hasCurrent && hasPrevious
            ? change(growth(current, previous))
            : "No baseline",
        ],
        [
          `Last year · ${monthName(oldMonth)}`,
          hasYearly ? format(yearly) : "Not recorded",
          hasCurrent && hasYearly
            ? change(growth(current, yearly))
            : "No baseline",
        ],
      ],
      caption: `Change compares the current month against each earlier period. Missing ${metric} records are shown as not recorded.`,
    });
  }
  return slides;
}
