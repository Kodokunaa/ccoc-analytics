export type RecordData = {
  id: string;
  serviceDate: string;
  serviceType: string;
  serviceName: string;
  attendance: {
    totalAttendance: number;
    adultCount: number;
    childrenCount: number;
    memberCount: number;
    visitorCount: number;
  } | null;
  giving: {
    amount: string | number;
  }[];
};
const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});
export const currency = (value: number) => peso.format(value);
export const givingTotal = (rows: RecordData["giving"]) =>
  rows.reduce((cents, g) => cents + Math.round(Number(g.amount) * 100), 0) /
  100;
export const growth = (current: number, previous: number) =>
  previous === 0
    ? current === 0
      ? 0
      : null
    : ((current - previous) / previous) * 100;
export function summary(records: RecordData[]) {
  const attendance = records.flatMap((r) =>
    r.attendance ? [r.attendance.totalAttendance] : [],
  );
  const giving = records.map((r) => givingTotal(r.giving));
  const totalAttendance = attendance.reduce((a, b) => a + b, 0),
    totalGiving =
      giving.reduce((cents, value) => cents + Math.round(value * 100), 0) / 100;
  const weeks = new Set(
    records.map((r) => {
      const d = new Date(r.serviceDate);
      const day = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
      return d.toISOString().slice(0, 10);
    }),
  ).size;
  return {
    totalAttendance,
    totalGiving,
    averageAttendance: attendance.length
      ? totalAttendance / attendance.length
      : 0,
    averageGiving: records.length ? totalGiving / records.length : 0,
    averageWeeklyAttendance: weeks ? totalAttendance / weeks : 0,
    averageWeeklyGiving: weeks ? totalGiving / weeks : 0,
    peakAttendance: attendance.reduce((a, b) => Math.max(a, b), 0),
    lowestAttendance: attendance.length
      ? attendance.reduce((a, b) => Math.min(a, b), Infinity)
      : 0,
    highestGiving: giving.reduce((a, b) => Math.max(a, b), 0),
    lowestGiving: giving.length
      ? giving.reduce((a, b) => Math.min(a, b), Infinity)
      : 0,
    givingPerAttendee: totalAttendance ? totalGiving / totalAttendance : 0,
  };
}
export function series(
  records: RecordData[],
  period: "weekly" | "monthly" | "quarterly" | "yearly" = "weekly",
) {
  const buckets = new Map<
    string,
    { name: string; attendance: number; giving: number }
  >();
  for (const r of records) {
    const date = new Date(r.serviceDate);
    if (period === "weekly")
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const key =
      period === "quarterly"
        ? `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
        : period === "yearly"
          ? String(date.getUTCFullYear())
          : date.toISOString().slice(0, period === "monthly" ? 7 : 10);
    const b = buckets.get(key) ?? { name: key, attendance: 0, giving: 0 };
    b.attendance += r.attendance?.totalAttendance ?? 0;
    b.giving += Math.round(givingTotal(r.giving) * 100);
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((b) => ({
      ...b,
      giving: b.giving / 100,
      perAttendee: b.attendance ? b.giving / 100 / b.attendance : 0,
    }));
}
export function pearson(points: { attendance: number; giving: number }[]) {
  if (points.length < 2) return null;
  const n = points.length,
    x = points.reduce((s, p) => s + p.attendance, 0) / n,
    y = points.reduce((s, p) => s + p.giving, 0) / n;
  const numerator = points.reduce(
      (s, p) => s + (p.attendance - x) * (p.giving - y),
      0,
    ),
    denominator = Math.sqrt(
      points.reduce((s, p) => s + (p.attendance - x) ** 2, 0) *
        points.reduce((s, p) => s + (p.giving - y) ** 2, 0),
    );
  return denominator ? numerator / denominator : null;
}
// Align buckets by elapsed period, so missing records cannot shift comparisons.
export function comparisonSeries(
  current: RecordData[],
  previous: RecordData[],
  currentStart: string,
  previousStart: string,
  period: "weekly" | "monthly",
) {
  const offset = (date: string, start: string) => {
    const d = new Date(date),
      s = new Date(start);
    if (period === "monthly")
      return (
        (d.getUTCFullYear() - s.getUTCFullYear()) * 12 +
        d.getUTCMonth() -
        s.getUTCMonth()
      );
    s.setUTCDate(s.getUTCDate() - ((s.getUTCDay() + 6) % 7));
    return Math.floor((d.getTime() - s.getTime()) / (7 * 86400000));
  };
  const prior = new Map(
    series(previous, period).map((p) => [
      offset(p.name.length === 7 ? `${p.name}-01` : p.name, previousStart),
      p,
    ]),
  );
  return series(current, period).map((p) => {
    const match = prior.get(
      offset(p.name.length === 7 ? `${p.name}-01` : p.name, currentStart),
    );
    return {
      ...p,
      previousAttendance: match?.attendance,
      previousGiving: match?.giving,
    };
  });
}
