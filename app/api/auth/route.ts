import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSession, currentUser, hashToken } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { auditContext } from "@/lib/audit";
import { reserveAttempt } from "@/lib/rate-limit";
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 },
    );
  try {
    const data = loginSchema.parse(await req.json());
    const key = hashToken(data.email);
    if (!(await reserveAttempt(data.email, 900000, 8)))
      return NextResponse.json(
        { error: "Too many attempts. Try again in 15 minutes." },
        {
          status: 429,
          headers: { "Retry-After": "900", "Cache-Control": "no-store" },
        },
      );
    const user = await db.user.findUnique({
      where: { email: data.email },
      include: { role: true },
    });
    const valid = await compare(
      data.password,
      user?.passwordHash ??
        "$2b$12$XhqIo.AA.KZVUksBaLQWfuCbBHh1zguYG.KRtGi43ihbJsdu2Oo4S",
    );
    if (
      !user ||
      user.status !== "ACTIVE" ||
      !valid ||
      !["SUPER_ADMIN", "ENCODER"].includes(user.role.name)
    )
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    await createSession(user.id);
    await db.$transaction([
      db.loginAttempt.deleteMany({ where: { id: key } }),
      db.auditLog.create({
        data: {
          userId: user.id,
          ...auditContext(req),
          action: "LOGIN",
          entity: "Session",
          entityId: user.id,
        },
      }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Login failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      {
        error: "Unable to log in. Check your details and database connection.",
      },
      { status: 400 },
    );
  }
}
export async function DELETE(req: NextRequest) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 },
    );
  const user = await currentUser(),
    token = (await cookies()).get("ccoc_session")?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  (await cookies()).delete("ccoc_session");
  if (user)
    await db.auditLog.create({
      data: {
        userId: user.id,
        ...auditContext(req),
        action: "LOGOUT",
        entity: "Session",
        entityId: user.id,
      },
    });
  return NextResponse.json({ ok: true });
}
