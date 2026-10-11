import { db } from "./db";
import { getTransparency, type TransparencyData } from "./transparency";
export async function reportSource(month: string) {
  const approval = await db.reportMonth.findUnique({ where: { month } });
  if (approval?.approvedAt && approval.snapshot) {
    const snapshot = approval.snapshot as unknown as {
      data: TransparencyData;
      previousYear: TransparencyData;
    };
    return { ...snapshot, approved: true };
  }
  const year = Number(month.slice(0, 4));
  const [data, previousYear] = await Promise.all([
    getTransparency(year),
    getTransparency(year - 1),
  ]);
  return { data, previousYear, approved: false };
}
