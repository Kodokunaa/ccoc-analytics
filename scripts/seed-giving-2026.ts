import { PrismaClient, type Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { givingLedger, givingLedgerTotals } from "../prisma/giving-ledger-2026";

const file = process.argv.find((a) => a.startsWith("--env-file="))?.slice(11);
if (!file)
  throw new Error("Provide --env-file=.env or --env-file=.env.production");
const config = parseEnv(readFileSync(file, "utf8"));
if (!config.DATABASE_URL)
  throw new Error("Selected environment file has no DATABASE_URL");
const db = new PrismaClient({
  datasources: { db: { url: config.DATABASE_URL } },
});
async function main() {
  const apply = process.argv.includes("--apply");
  const result = await db.$transaction(
    async (tx) => {
      if (apply) await tx.$executeRaw`SELECT pg_advisory_xact_lock(20261018)`;
      else await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const admin = await tx.user.findFirstOrThrow({
        where: { role: { name: "SUPER_ADMIN" }, status: "ACTIVE" },
        orderBy: { createdAt: "asc" },
      });
      const services = await tx.service.findMany({
        where: {
          serviceDate: { in: givingLedger.map((r) => new Date(r.date)) },
        },
        include: { giving: true },
      });
      const campaignBefore = await tx.capitalCampaignEntry.findMany({
        orderBy: { id: "asc" },
      });
      const giving: Prisma.GivingRecordCreateManyInput[] = [],
        newServices: Prisma.ServiceCreateManyInput[] = [],
        logs: Prisma.AuditLogCreateManyInput[] = [];
      let skipped = 0;
      for (const row of givingLedger) {
        const matches = services.filter(
          (s) => s.serviceDate.toISOString().slice(0, 10) === row.date,
        );
        if (
          matches.length > 1 ||
          matches[0]?.deletedAt ||
          (matches[0] && matches[0].serviceType !== "SUNDAY_SERVICE")
        )
          throw new Error(
            `Service on ${row.date} requires review; no changes applied.`,
          );
        const existing = matches[0],
          id = `ledger-giving-${row.date}`,
          serviceId = existing?.id ?? `ledger-offerings-${row.date}`;
        if (existing?.giving.length) {
          if (
            existing.giving.length !== 1 ||
            existing.giving[0].id !== id ||
            Number(existing.giving[0].amount) !== row.amount
          )
            throw new Error(
              `Giving on ${row.date} conflicts; no changes applied.`,
            );
          skipped++;
          continue;
        }
        // Months with no supplied attendance get a service only, not a zero attendance record.
        if (!existing) {
          newServices.push({
            id: serviceId,
            serviceDate: new Date(row.date),
            serviceType: "SUNDAY_SERVICE",
            serviceName: "Sunday Worship",
            createdBy: admin.id,
            notes:
              "Sunday offerings ledger supplied 2026-10-18. Attendance not supplied.",
          });
          logs.push({
            userId: admin.id,
            action: "CREATE",
            entity: "Service",
            entityId: serviceId,
            newData: {
              source: "offerings-ledger-2026-10-18",
              date: row.date,
              attendance: null,
            },
          });
        }
        const notes = `Transcribed from Sunday offerings ledger supplied 2026-10-18; separate from capital campaign.${row.date.startsWith("2026-06") ? " June entries total PHP 9718; handwritten subtotal PHP 9724; PHP 6 discrepancy unresolved." : ""}`;
        giving.push({
          id,
          serviceId,
          amount: row.amount,
          createdBy: admin.id,
          notes,
        });
        logs.push({
          userId: admin.id,
          action: "CREATE",
          entity: "GivingRecord",
          entityId: id,
          newData: {
            source: "offerings-ledger-2026-10-18",
            date: row.date,
            amount: row.amount,
            serviceId,
          },
        });
      }
      if (apply) {
        if (newServices.length)
          await tx.service.createMany({ data: newServices });
        if (giving.length) await tx.givingRecord.createMany({ data: giving });
        if (logs.length) await tx.auditLog.createMany({ data: logs });
        const campaignAfter = await tx.capitalCampaignEntry.findMany({
          orderBy: { id: "asc" },
        });
        if (JSON.stringify(campaignBefore) !== JSON.stringify(campaignAfter))
          throw new Error(
            "Campaign changed during import; transaction rolled back.",
          );
      }
      return {
        applied: apply,
        givingAdded: giving.length,
        givingSkipped: skipped,
        servicesAdded: newServices.length,
        monthlyTotals: givingLedgerTotals,
        total: givingLedger.reduce((s, r) => s + r.amount, 0),
        campaignUnchanged: true,
        juneDiscrepancy: 6,
      };
    },
    { isolationLevel: "Serializable", timeout: 120000 },
  );
  console.log(JSON.stringify(result));
}
main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error && !error.name.startsWith("Prisma")
        ? error.message
        : "Giving import failed; transaction rolled back. Check database connectivity.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
