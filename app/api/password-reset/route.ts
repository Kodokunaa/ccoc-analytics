import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth";
import { reserveAttempt } from "@/lib/rate-limit";
import { auditContext } from "@/lib/audit";
import { mailConfigured, sendPasswordReset } from "@/lib/mail";
import { userSchema } from "@/lib/validation";
export async function POST(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      return NextResponse.json({ error: "Invalid request" }, { status: 403 });
    const input = z
      .object({ email: z.string().trim().toLowerCase().pipe(z.email()) })
      .parse(await req.json());
    if (
      !(await reserveAttempt(`reset-email:${input.email}`, 3600000, 4)) ||
      !(await reserveAttempt(
        `reset-ip:${auditContext(req).ipAddress ?? "local"}`,
        3600000,
        30,
      ))
    )
      return NextResponse.json(
        { error: "Please wait before requesting another reset." },
        { status: 429, headers: { "Retry-After": "3600" } },
      );
    if (!mailConfigured())
      return NextResponse.json(
        {
          error:
            "Password reset email is not configured yet. Contact the church administrator.",
        },
        { status: 503 },
      );
    const user = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true, status: true, role: { select: { name: true } } },
    });
    await db.passwordReset.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (
      user?.status === "ACTIVE" &&
      ["SUPER_ADMIN", "ENCODER"].includes(user.role.name)
    ) {
      const token = randomBytes(32).toString("base64url"),
        tokenHash = hashToken(token);
      const base = new URL(process.env.APP_URL || "http://localhost:3000");
      if (
        base.protocol !== "https:" &&
        !["localhost", "127.0.0.1"].includes(base.hostname)
      )
        throw new Error("Invalid reset origin");
      const link = new URL("/admin/reset-password", base);
      link.searchParams.set("token", token);
      await db.passwordReset.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      try {
        await sendPasswordReset(input.email, link.toString());
      } catch {
        await db.passwordReset.deleteMany({ where: { tokenHash } });
        /* Preserve the same response for known and unknown accounts. */ console.error(
          "Password reset email delivery failed. Check SMTP configuration.",
        );
      }
    }
    return NextResponse.json(
      {
        message:
          "If an active staff account exists for this email, a reset link has been requested. Check your inbox and spam folder.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Unable to request a password reset. Check your email address and try again.",
      },
      { status: 400 },
    );
  }
}
export async function PATCH(req: NextRequest) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin)
      return NextResponse.json({ error: "Invalid request" }, { status: 403 });
    const input = z
      .object({
        token: z.string().regex(/^[\w-]{43}$/),
        password: userSchema.shape.password.unwrap(),
      })
      .parse(await req.json());
    if (
      !(await reserveAttempt(
        `reset-token:${hashToken(input.token)}`,
        900000,
        8,
      ))
    )
      return NextResponse.json(
        { error: "Please wait before trying again." },
        { status: 429 },
      );
    const passwordHash = await hash(input.password, 12),
      tokenHash = hashToken(input.token);
    await db.$transaction(
      async (tx) => {
        const reset = await tx.passwordReset.findUnique({
          where: { tokenHash },
        });
        if (!reset || reset.expiresAt <= new Date())
          throw new Error("INVALID_TOKEN");
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${reset.userId} FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: reset.userId },
          select: { status: true, role: { select: { name: true } } },
        });
        if (
          user?.status !== "ACTIVE" ||
          !["SUPER_ADMIN", "ENCODER"].includes(user.role.name)
        )
          throw new Error("INVALID_TOKEN");
        const consumed = await tx.passwordReset.deleteMany({
          where: { tokenHash, expiresAt: { gt: new Date() } },
        });
        if (consumed.count !== 1) throw new Error("INVALID_TOKEN");
        await tx.user.update({
          where: { id: reset.userId },
          data: { passwordHash },
        });
        await tx.session.deleteMany({ where: { userId: reset.userId } });
        await tx.passwordReset.deleteMany({ where: { userId: reset.userId } });
        await tx.auditLog.create({
          data: {
            userId: reset.userId,
            action: "UPDATE",
            entity: "password-reset",
            entityId: reset.userId,
            ...auditContext(req),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return NextResponse.json(
      { message: "Password updated. Sign in with your new password." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Use a password with 12–72 characters and no more than 72 UTF-8 bytes."
            : "This reset link is invalid or expired. Request a new link.",
      },
      { status: 400 },
    );
  }
}
