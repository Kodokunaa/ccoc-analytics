import type { Prisma } from "@prisma/client";
export const monthKey = (date: string | Date) =>
  (typeof date === "string" ? date : date.toISOString()).slice(0, 7);
export async function lockMonths(
  tx: Prisma.TransactionClient,
  months: string[],
  allowApproved = false,
) {
  for (const month of [...new Set(months)].sort()) {
    await tx.reportMonth.upsert({
      where: { month },
      create: { month },
      update: {},
    });
    const rows = await tx.$queryRaw<
      { approvedAt: Date | null }[]
    >`SELECT "approvedAt" FROM "ReportMonth" WHERE month = ${month} FOR UPDATE`;
    if (!allowApproved && rows[0]?.approvedAt)
      throw new Error(
        "This month is approved and locked. An administrator must reopen it first.",
      );
  }
}
