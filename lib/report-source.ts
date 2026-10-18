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
  // The production pool intentionally has one connection. Each transparency
  // load issues several queries; overlapping two loads exhausts its queue and
  // can time out previews and monthly exports before any file is generated.
  const data = await getTransparency(year);
  const previousYear = await getTransparency(year - 1);
  return { data, previousYear, approved: false };
}
