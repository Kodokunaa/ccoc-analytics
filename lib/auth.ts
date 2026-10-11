import { cookies } from "next/headers";
import { createHash, randomBytes, createHmac } from "node:crypto";
import { db } from "./db";
import { cache } from "react";
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const currentUser = cache(async () => {
  const token = (await cookies()).get("ccoc_session")?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: hashToken(token) },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          role: { select: { name: true } },
        },
      },
    },
  });
  if (
    !session ||
    session.expiresAt <= new Date() ||
    session.user.status !== "ACTIVE" ||
    !["SUPER_ADMIN", "ENCODER"].includes(session.user.role.name)
  )
    return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role.name,
  };
});
export async function createSession(userId: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters");
  const token = createHmac("sha256", secret)
    .update(randomBytes(32))
    .digest("hex");
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await db.session.create({
    data: { id: hashToken(token), userId, expiresAt },
  });
  (await cookies()).set("ccoc_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}
export async function requireUser(admin = false) {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (admin && user.role !== "SUPER_ADMIN") throw new Error("FORBIDDEN");
  return user;
}
