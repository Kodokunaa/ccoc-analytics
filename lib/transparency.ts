import { db } from "./db";
import { type RecordData } from "./analytics";
import { monthReport } from "./public-analytics";
export { monthReport, monthName } from "./public-analytics";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
export const publicQuerySchema = z.object({
  year: z.coerce.number().int().min(1990).max(2100),
});
const publicSelect = {
  id: true,
  serviceDate: true,
  serviceType: true,
  serviceName: true,
  attendance: {
    select: {
      totalAttendance: true,
      adultCount: true,
      childrenCount: true,
      memberCount: true,
      visitorCount: true,
    },
  },
  giving: {
    select: {
      amount: true,
    },
  },
} as const;
export async function getTransparency(
  year: number,
  client: Prisma.TransactionClient = db,
) {
  const query = publicQuerySchema
    .extend({ year: z.number().int().min(1989).max(2100) })
    .parse({ year });
  const [services, dates, settings, updated, campaign] = await Promise.all([
    client.service.findMany({
      where: {
        deletedAt: null,
        serviceDate: {
          gte: new Date(`${query.year - 1}-12-01`),
          lt: new Date(`${query.year + 1}-01-01`),
        },
      },
      select: publicSelect,
      orderBy: { serviceDate: "asc" },
    }),
    client.$queryRaw<{ year: number; latest: Date }[]>`
      SELECT EXTRACT(YEAR FROM "serviceDate")::int AS year, MAX("serviceDate") AS latest
      FROM "Service" WHERE "deletedAt" IS NULL
      GROUP BY EXTRACT(YEAR FROM "serviceDate") ORDER BY year DESC`,
    client.appSetting.findMany({
      where: { key: { in: ["churchName", "churchAddress", "logo"] } },
      select: { key: true, value: true },
    }),
    client.$queryRaw<{ updated: Date | null }[]>`
      SELECT MAX(changed) AS updated FROM (
        SELECT MAX(GREATEST("updatedAt", "deletedAt")) AS changed FROM "Service"
        UNION ALL SELECT MAX(a."updatedAt") FROM "AttendanceRecord" a JOIN "Service" s ON a."serviceId" = s.id WHERE s."deletedAt" IS NULL
        UNION ALL SELECT MAX(g."updatedAt") FROM "GivingRecord" g JOIN "Service" s ON g."serviceId" = s.id WHERE s."deletedAt" IS NULL
        UNION ALL SELECT MAX("updatedAt") FROM "AppSetting" WHERE key IN ('churchName', 'churchAddress', 'logo')
        UNION ALL SELECT MAX("createdAt") FROM "CapitalCampaignEntry"
      ) changes`,
    client.capitalCampaignEntry.findMany({
      where: { year: { lte: year } },
      orderBy: [{ year: "asc" }, { month: "asc" }, { id: "asc" }],
      select: { id: true, year: true, month: true, label: true, amount: true },
    }),
  ]);
  const records = JSON.parse(JSON.stringify(services)) as RecordData[];
  return {
    campaign: campaign.map((entry) => ({
      ...entry,
      amount: entry.amount.toString(),
    })),
    records,
    months: Array.from({ length: 12 }, (_, i) =>
      (() => {
        const report = monthReport(
          records,
          `${year}-${String(i + 1).padStart(2, "0")}`,
        );
        const {
          records: current,
          previousRecords: previous,
          ...metrics
        } = report;
        void current;
        void previous;
        return metrics;
      })(),
    ),
    years: Array.from(
      new Set([
        year,
        ...dates.map((d) => d.year),
        ...campaign.map((e) => e.year),
      ]),
    ).sort((a, b) => b - a),
    latestMonth:
      dates[0]?.latest.toISOString().slice(0, 7) ??
      new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        timeZone: "Asia/Manila",
      }).format(new Date()),
    churchName:
      settings.find((s) => s.key === "churchName")?.value ??
      "City Church of Christ",
    churchAddress: settings.find((s) => s.key === "churchAddress")?.value ?? "",
    logo: settings.find((s) => s.key === "logo")?.value ?? "",
    lastUpdated: updated[0]?.updated?.toISOString() ?? null,
  };
}
export type TransparencyData = Awaited<ReturnType<typeof getTransparency>>;
