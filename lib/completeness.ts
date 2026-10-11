import type { RecordData } from "./analytics";
export function monthCompleteness(
  records: RecordData[],
  month: string,
  today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }),
) {
  const [year, m] = month.split("-").map(Number);
  const days: { date: string; issues: string[]; future: boolean }[] = [];
  for (
    let d = new Date(Date.UTC(year, m - 1, 1));
    d.getUTCMonth() === m - 1;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    if (d.getUTCDay() !== 0) continue;
    const date = d.toISOString().slice(0, 10);
    const matches = records.filter((r) => r.serviceDate.slice(0, 10) === date);
    const record = matches[0];
    days.push({
      date,
      future: date > today,
      issues: !record
        ? ["Service missing"]
        : [
            ...(matches.length > 1 ? ["Duplicate services"] : []),
            ...(!record.attendance ? ["Attendance missing"] : []),
            ...(!record.giving.length
              ? ["Giving missing (record zero explicitly if none)"]
              : []),
          ],
    });
  }
  return {
    days,
    complete: days.every((d) => !d.issues.length),
    ended: today.slice(0, 7) > month,
  };
}
