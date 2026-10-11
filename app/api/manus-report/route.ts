import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { reserveAttempt } from "@/lib/rate-limit";
import { reportSource } from "@/lib/report-source";
import {
  createManusTask,
  monthlyAssistantPayload,
  readManusTask,
} from "@/lib/manus";
import { auditContext } from "@/lib/audit";

const monthSchema = z.string().regex(/^(199\d|20\d\d|2100)-(0[1-9]|1[0-2])$/);
const active = ["CREATING", "UNKNOWN", "RUNNING", "WAITING"];
const selection = {
  id: true,
  month: true,
  status: true,
  remoteUrl: true,
  output: true,
  payload: true,
  createdAt: true,
  updatedAt: true,
} as const;
const response = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHENTICATED")
    return response({ error: "Staff sign-in required." }, 401);
  if (message === "FORBIDDEN")
    return response({ error: "Administrator access required." }, 403);
  if (error instanceof z.ZodError)
    return response({ error: "Invalid request or provider response." }, 400);
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return response(
      { error: "An assistant task is already active for this month." },
      409,
    );
  return response(
    { error: "Unable to update the assistant. Try checking progress again." },
    502,
  );
}
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const month = monthSchema.parse(req.nextUrl.searchParams.get("month"));
    const tasks = await db.manusReportTask.findMany({
      where: { month },
      select: selection,
      take: 10,
      orderBy: { createdAt: "desc" },
    });
    // A server interruption may leave a reserved task without its remote identifier.
    // Expose that uncertainty instead of silently creating a duplicate paid task.
    return response({
      configured: Boolean(process.env.MANUS_API_KEY?.trim()),
      tasks: tasks.map((t) => ({
        ...t,
        status:
          t.status === "CREATING" && Date.now() - t.createdAt.getTime() > 120000
            ? "UNKNOWN"
            : t.status,
      })),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      throw new Error("FORBIDDEN");
    const user = await requireUser(true);
    const input = z
      .object({
        action: z.enum(["create", "refresh", "release"]),
        month: monthSchema,
        id: z.string().max(100).optional(),
      })
      .parse(await req.json());
    if (
      !(await reserveAttempt(
        `manus:${user.id}:${input.action}`,
        input.action === "create" ? 3600000 : 60000,
        input.action === "create" ? 5 : 10,
      ))
    )
      return response(
        {
          error:
            "Too many assistant requests. Please wait before trying again.",
        },
        429,
      );
    const key = process.env.MANUS_API_KEY?.trim();
    if (!key && input.action !== "release")
      return response(
        {
          error:
            "Add MANUS_API_KEY to the server .env file and restart the app to enable this assistant.",
        },
        503,
      );
    if (input.action === "create") {
      const source = await reportSource(input.month);
      const payload = monthlyAssistantPayload(
        source.data.records,
        source.previousYear.records,
        input.month,
        source.approved,
      );
      if (!payload.current.servicesRecorded)
        return response(
          {
            error:
              "Record Sunday data for this month before creating commentary.",
          },
          400,
        );
      const task = await db.$transaction(async (tx) => {
        const created = await tx.manusReportTask.create({
          data: { month: input.month, createdBy: user.id, payload },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "CREATE",
            entity: "ManusReportTask",
            entityId: created.id,
            newData: { month: input.month, approved: source.approved },
            ...auditContext(req),
          },
        });
        return created;
      });
      try {
        const remote = await createManusTask(payload, key!);
        await db.manusReportTask.update({
          where: { id: task.id },
          data: { ...remote, status: "RUNNING" },
        });
        return response({ id: task.id, status: "RUNNING" }, 201);
      } catch {
        await db.manusReportTask.update({
          where: { id: task.id },
          data: { status: "UNKNOWN" },
        });
        return response(
          {
            error:
              "Manus did not confirm creation. Check your Manus account before releasing this request; it may have consumed credits.",
          },
          502,
        );
      }
    }
    const task = await db.manusReportTask.findFirst({
      where: { id: input.id ?? "", month: input.month },
    });
    if (!task) return response({ error: "Task not found." }, 404);
    if (input.action === "release") {
      if (!(
        task.status === "UNKNOWN" ||
        (task.status === "CREATING" &&
          Date.now() - task.createdAt.getTime() > 120000)
      ))
        return response(
          { error: "Only unconfirmed requests can be released." },
          409,
        );
      await db.$transaction(async (tx) => {
        await tx.manusReportTask.update({
          where: { id: task.id },
          data: { status: "RELEASED" },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "UPDATE",
            entity: "ManusReportTask",
            entityId: task.id,
            newData: { status: "RELEASED" },
            ...auditContext(req),
          },
        });
      });
      return response({ status: "RELEASED" });
    }
    if (!task.remoteId || !active.includes(task.status))
      return response({ error: "This task cannot be refreshed." }, 409);
    if (Date.now() - task.updatedAt.getTime() < 10000)
      return response(
        { error: "Wait ten seconds between progress checks." },
        429,
      );
    // Reserve a provider poll atomically to avoid concurrent tabs issuing duplicate requests.
    const reserved = await db.manusReportTask.updateMany({
      where: { id: task.id, updatedAt: task.updatedAt },
      data: { updatedAt: new Date() },
    });
    if (!reserved.count)
      return response({ error: "A progress check is already running." }, 409);
    const result = await readManusTask(task.remoteId, key!);
    await db.manusReportTask.update({
      where: { id: task.id },
      data: {
        status: result.status,
        ...(result.output ? { output: result.output } : {}),
      },
    });
    return response({ status: result.status });
  } catch (error) {
    return failure(error);
  }
}
