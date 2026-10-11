import { NextRequest, NextResponse } from "next/server";
import { Prisma, AuditAction } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { auditContext } from "@/lib/audit";
import { lockMonths, monthKey } from "@/lib/report-lock";
import { mailConfigured } from "@/lib/mail";
import {
  serviceSchema,
  attendanceSchema,
  givingSchema,
  userSchema,
  targetSchema,
  settingsSchema,
} from "@/lib/validation";
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const section = req.nextUrl.searchParams.get("section");
    const [services, targets, settings, users, logs] = await Promise.all([
      db.service.findMany({
        where: { deletedAt: null },
        include: {
          attendance: { include: { creator: { select: { name: true } } } },
          giving: {
            include: { creator: { select: { name: true } } },
          },
          creator: { select: { name: true } },
        },
        orderBy: { serviceDate: "desc" },
      }),
      db.target.findMany({ orderBy: { startDate: "desc" } }),
      db.appSetting.findMany(),
      user.role === "SUPER_ADMIN" && (!section || section === "users")
        ? db.user.findMany({
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              role: { select: { name: true } },
              createdAt: true,
            },
            orderBy: { name: "asc" },
          })
        : [],
      user.role === "SUPER_ADMIN" && (!section || section === "audit-logs")
        ? db.auditLog.findMany({
            include: { user: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 500,
          })
        : [],
    ]);
    return NextResponse.json(
      {
        user,
        services,
        targets,
        settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
        users,
        logs,
        mailConfigured:
          user.role === "SUPER_ADMIN" ? mailConfigured() : undefined,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  const message = e instanceof Error ? e.message : "Unable to save record";
  if (e instanceof z.ZodError)
    return NextResponse.json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  const status =
    message === "UNAUTHENTICATED"
      ? 401
      : message === "FORBIDDEN"
        ? 403
        : e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === "P2002"
          ? 409
          : e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === "P2034"
            ? 409
            : 400;
  if (status === 400) console.error(e);
  return NextResponse.json(
    {
      error:
        status === 401
          ? "Please log in"
          : status === 403
            ? "Unauthorized action"
            : status === 409
              ? e instanceof Prisma.PrismaClientKnownRequestError &&
                e.code === "P2034"
                ? "Another update happened at the same time. Please try again."
                : "A record with these details already exists"
              : [
                    "Service not found",
                    "This month is approved and locked. An administrator must reopen it first.",
                    "Record ID required",
                    "You cannot deactivate or demote your own account",
                    "A password of at least 12 characters is required",
                  ].includes(message)
                ? message
                : "Unable to save the record. Please try again.",
    },
    { status },
  );
}
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new Error("FORBIDDEN");
    const user = await requireUser();
    const body = z
      .object({
        entity: z.enum([
          "service",
          "attendance",
          "giving",
          "target",
          "user",
          "settings",
        ]),
        id: z.string().optional(),
        remove: z.boolean().optional(),
        data: z.unknown().optional(),
      })
      .parse(await req.json());
    if (
      body.remove &&
      (!["service", "target"].includes(body.entity) || !body.id)
    )
      throw new Error("Invalid removal request");
    const admin =
      ["user", "settings", "target"].includes(body.entity) || body.remove;
    if (admin && user.role !== "SUPER_ADMIN") throw new Error("FORBIDDEN");
    if (user.role === "VIEWER") throw new Error("FORBIDDEN");
    const password =
      body.entity === "user" ? userSchema.parse(body.data).password : undefined;
    const passwordHash = password ? await hash(password, 12) : undefined;
    const result = await db.$transaction(
      async (tx) => {
        let old: unknown = null,
          saved: unknown = null;
        const editable = async (serviceId: string) => {
          const service = await tx.service.findUnique({
            where: { id: serviceId },
          });
          if (!service || service.deletedAt)
            throw new Error("Service not found");
          if (user.role === "ENCODER" && service.createdBy !== user.id)
            throw new Error("FORBIDDEN");
          return service;
        };
        if (body.entity === "service") {
          if (body.id) old = await editable(body.id);
          const months = old
            ? [monthKey((old as { serviceDate: Date }).serviceDate)]
            : [];
          if (!body.remove)
            months.push(monthKey(serviceSchema.parse(body.data).serviceDate));
          await lockMonths(tx, months);
          if (body.remove) {
            if (!body.id) throw new Error("Record ID required");
            saved = await tx.service.update({
              where: { id: body.id },
              data: { deletedAt: new Date() },
            });
          } else {
            const parsed = serviceSchema.parse(body.data);
            const { attendance, giving, ...fields } = parsed;
            saved = body.id
              ? await tx.service.update({
                  where: { id: body.id },
                  data: {
                    ...fields,
                    serviceDate: new Date(fields.serviceDate),
                  },
                })
              : await tx.service.create({
                  data: {
                    ...fields,
                    serviceDate: new Date(fields.serviceDate),
                    createdBy: user.id,
                  },
                });
            const serviceId = (saved as { id: string }).id;
            if (attendance) {
              const beforeAttendance = await tx.attendanceRecord.findUnique({
                where: { serviceId },
              });
              const attendanceRecord = await tx.attendanceRecord.upsert({
                where: { serviceId },
                create: { ...attendance, serviceId, createdBy: user.id },
                update: attendance,
              });
              await tx.auditLog.create({
                data: {
                  userId: user.id,
                  ...auditContext(req),
                  action: beforeAttendance ? "UPDATE" : "CREATE",
                  entity: "attendance",
                  entityId: attendanceRecord.id,
                  newData: json(attendance),
                  ...(beforeAttendance
                    ? { oldData: json(beforeAttendance) }
                    : {}),
                },
              });
            }
            if (giving?.length) {
              await tx.givingRecord.createMany({
                data: giving.map((g) => ({
                  ...g,
                  serviceId,
                  createdBy: user.id,
                })),
              });
              await tx.auditLog.create({
                data: {
                  userId: user.id,
                  action: "CREATE",
                  ...auditContext(req),
                  entity: "giving",
                  entityId: serviceId,
                  newData: json(giving),
                },
              });
            }
          }
        } else if (body.entity === "attendance" || body.entity === "giving") {
          const input = z
            .object({ serviceId: z.string().min(1) })
            .passthrough()
            .parse(body.data);
          const service = await editable(input.serviceId);
          const months = [monthKey(service.serviceDate)];
          if (body.entity === "giving" && body.id) {
            const giving = await tx.givingRecord.findUniqueOrThrow({
              where: { id: body.id },
            });
            const previousService = await editable(giving.serviceId);
            months.push(monthKey(previousService.serviceDate));
          }
          await lockMonths(tx, months);
          if (body.entity === "attendance") {
            const data = attendanceSchema.parse(input);
            old = await tx.attendanceRecord.findUnique({
              where: { serviceId: input.serviceId },
            });
            saved = await tx.attendanceRecord.upsert({
              where: { serviceId: input.serviceId },
              create: {
                ...data,
                serviceId: input.serviceId,
                createdBy: user.id,
              },
              update: data,
            });
          } else {
            const data = givingSchema.parse(input);
            if (body.id) {
              old = await tx.givingRecord.findUniqueOrThrow({
                where: { id: body.id },
              });
              await editable((old as { serviceId: string }).serviceId);
              saved = await tx.givingRecord.update({
                where: { id: body.id },
                data: { ...data, serviceId: input.serviceId },
              });
            } else
              saved = await tx.givingRecord.create({
                data: {
                  ...data,
                  serviceId: input.serviceId,
                  createdBy: user.id,
                },
              });
          }
        } else if (body.entity === "target") {
          if (body.id)
            old = await tx.target.findUniqueOrThrow({ where: { id: body.id } });
          if (body.remove) {
            saved = await tx.target.delete({ where: { id: body.id } });
          } else {
            const d = targetSchema.parse(body.data),
              data = {
                ...d,
                startDate: new Date(d.startDate),
                endDate: new Date(d.endDate),
              };
            saved = body.id
              ? await tx.target.update({ where: { id: body.id }, data })
              : await tx.target.create({
                  data: { ...data, createdBy: user.id },
                });
          }
        } else if (body.entity === "user") {
          const d = userSchema.parse(body.data);
          const encoderRole = await tx.role.findUniqueOrThrow({
            where: { name: "ENCODER" },
          });
          let roleId = encoderRole.id;
          if (body.id) {
            const before = await tx.user.findUniqueOrThrow({
              where: { id: body.id },
              include: { role: true },
            });
            // Administrators retain their role; all other staff accounts are encoders.
            // Role assignment never comes from the browser or API request.
            if (before.role.name === "SUPER_ADMIN") roleId = before.roleId;
            old = {
              id: before.id,
              name: before.name,
              email: before.email,
              roleId: before.roleId,
              status: before.status,
            };
            if (body.id === user.id && d.status !== "ACTIVE")
              throw new Error("You cannot deactivate your own account");
          }
          if (!body.id && !d.password)
            throw new Error("A password of at least 12 characters is required");
          const data = {
            name: d.name,
            email: d.email,
            status: d.status,
            roleId,
            ...(passwordHash ? { passwordHash } : {}),
          };
          const select = {
            id: true,
            name: true,
            email: true,
            status: true,
            roleId: true,
          };
          saved = body.id
            ? await tx.user.update({ where: { id: body.id }, data, select })
            : await tx.user.create({
                data: { ...data, passwordHash: data.passwordHash! },
                select,
              });
          if (body.id)
            await tx.session.deleteMany({ where: { userId: body.id } });
          if (body.id)
            await tx.passwordReset.deleteMany({ where: { userId: body.id } });
        } else if (body.entity === "settings") {
          const d = settingsSchema.parse(body.data);
          old = await tx.appSetting.findMany();
          for (const [key, value] of Object.entries(d))
            await tx.appSetting.upsert({
              where: { key },
              create: { key, value },
              update: { value },
            });
          saved = d;
        }
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: (body.remove
              ? "DELETE"
              : old
                ? "UPDATE"
                : "CREATE") as AuditAction,
            ...auditContext(req),
            entity: body.entity,
            entityId: (saved as { id?: string })?.id ?? body.id ?? body.entity,
            ...(old ? { oldData: json(old) } : {}),
            newData: json(saved),
          },
        });
        return saved;
      },
      {
        timeout: 15000,
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
    return NextResponse.json({ ok: true, record: result });
  } catch (e) {
    return failure(e);
  }
}
