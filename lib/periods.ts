export function comparisonWindow(
  start: string,
  end: string,
  comparison: string,
  customStart: string,
  customEnd: string,
) {
  const a = new Date(start),
    b = new Date(end);
  if (comparison === "year") {
    const aMonth = a.getUTCMonth(),
      bMonth = b.getUTCMonth();
    a.setUTCFullYear(a.getUTCFullYear() - 1);
    b.setUTCFullYear(b.getUTCFullYear() - 1);
    if (a.getUTCMonth() !== aMonth) a.setUTCDate(0);
    if (b.getUTCMonth() !== bMonth) b.setUTCDate(0);
  }
  if (comparison === "month") {
    a.setUTCMonth(a.getUTCMonth() - 1, 1);
    b.setUTCFullYear(a.getUTCFullYear(), a.getUTCMonth() + 1, 0);
  }
  if (comparison === "previousYear") {
    a.setUTCFullYear(a.getUTCFullYear() - 1, 0, 1);
    b.setUTCFullYear(a.getUTCFullYear(), 11, 31);
  }
  return {
    start: comparison === "custom" ? customStart : a.toISOString().slice(0, 10),
    end: comparison === "custom" ? customEnd : b.toISOString().slice(0, 10),
  };
}
export function periodWindow(date: string, period: string) {
  const d = new Date(date),
    a = new Date(d),
    b = new Date(d);
  if (period === "WEEKLY") {
    a.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    b.setTime(a.getTime() + 6 * 86400000);
  }
  if (period === "MONTHLY") {
    a.setUTCDate(1);
    b.setUTCMonth(d.getUTCMonth() + 1, 0);
  }
  if (period === "QUARTERLY") {
    a.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3, 1);
    b.setUTCMonth(a.getUTCMonth() + 3, 0);
  }
  if (period === "YEARLY") {
    a.setUTCMonth(0, 1);
    b.setUTCMonth(11, 31);
  }
  return {
    start: a.toISOString().slice(0, 10),
    end: b.toISOString().slice(0, 10),
  };
}
