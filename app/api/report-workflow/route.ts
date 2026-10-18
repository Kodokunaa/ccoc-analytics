import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { auditContext } from "@/lib/audit";
import { getTransparency } from "@/lib/transparency";
import { monthCompleteness } from "@/lib/completeness";
import { lockMonths, monthKey } from "@/lib/report-lock";
const monthSchema = z.string().regex(/^(199\d|20\d\d|2100)-(0[1-9]|1[0-2])$/);
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const month = monthSchema.parse(req.nextUrl.searchParams.get("month"));
    const data = await getTransparency(Number(month.slice(0, 4)));
    const [approval, archives, artifacts] = await Promise.all([
      db.reportMonth.findUnique({
        where: { month },
        select: { month: true, approvedAt: true, approvedBy: true },
      }),
      user.role === "SUPER_ADMIN"
        ? db.service.findMany({
            where: { deletedAt: { not: null } },
            select: {
              id: true,
              serviceDate: true,
              serviceName: true,
              deletedAt: true,
            },
            orderBy: { deletedAt: "desc" },
            take: 100,
          })
        : [],
      db.reportArtifact.findMany({
        where: { month },
        select: {
          id: true,
          filename: true,
          checksum: true,
          approved: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    return NextResponse.json(
      {
        completeness: monthCompleteness(data.records, month),
        approval,
        archives,
        artifacts,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to load report workflow" },
      {
        status:
          error instanceof Error && error.message === "UNAUTHENTICATED"
            ? 401
            : 400,
      },
    );
  }
}
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new Error("FORBIDDEN");
    const user = await requireUser(true);
    const input = z
      .object({
        action: z.enum(["approve", "reopen", "restore"]),
        month: monthSchema,
        id: z.string().optional(),
      })
      .parse(await req.json());
    await db.$transaction(
      async (tx) => {
        if (input.action === "restore") {
          const service = await tx.service.findUniqueOrThrow({
            where: { id: input.id ?? "" },
          });
          if (!service.deletedAt)
            throw new Error("The service is already active.");
          await lockMonths(tx, [monthKey(service.serviceDate)]);
          await tx.service.update({
            where: { id: service.id },
            data: { deletedAt: null },
          });
        } else {
          await lockMonths(tx, [input.month], true);
          const before = await tx.reportMonth.findUniqueOrThrow({
            where: { month: input.month },
          });
          if (input.action === "approve") {
            if (before.approvedAt)
              throw new Error("This month is already approved.");
            const year = Number(input.month.slice(0, 4));
            const data = await getTransparency(year, tx);
            const completeness = monthCompleteness(data.records, input.month);
            if (!completeness.ended || !completeness.complete)
              throw new Error(
                "Approval requires a finished month with all Sunday attendance and giving recorded.",
              );
            const previousYear = await getTransparency(year - 1, tx);
            await tx.reportMonth.update({
              where: { month: input.month },
              data: {
                approvedAt: new Date(),
                approvedBy: user.name,
                snapshot: JSON.parse(
                  JSON.stringify({ data, previousYear }),
                ) as Prisma.InputJsonValue,
              },
            });
          } else {
            await tx.reportMonth.update({
              where: { month: input.month },
              data: {
                approvedAt: null,
                approvedBy: null,
                snapshot: Prisma.DbNull,
              },
            });
          }
        }
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "UPDATE",
            entity: "report-workflow",
            entityId: input.id ?? input.month,
            newData: input,
            ...auditContext(req),
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 20000,
      },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update report";
    const conflict =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code);
    const allowed = [
      "The service is already active.",
      "This month is already approved.",
      "Approval requires a finished month with all Sunday attendance and giving recorded.",
      "This month is approved and locked. An administrator must reopen it first.",
    ];
    return NextResponse.json(
      {
        error: conflict
          ? "A service already exists on this date, or another update occurred. Refresh and try again."
          : allowed.includes(message)
            ? message
            : "Unable to update report",
      },
      {
        status:
          message === "UNAUTHENTICATED"
            ? 401
            : message === "FORBIDDEN"
              ? 403
              : conflict
                ? 409
                : 400,
      },
    );
  }
}
