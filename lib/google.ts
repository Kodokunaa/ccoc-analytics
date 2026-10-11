import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { randomBytes, createHash, createHmac } from "node:crypto";
import { db } from "./db";
import { allowedReturnPath, verifiedGoogleClaims } from "./google-identity";
import { hashToken } from "./auth";
export const googleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export function appOrigin() {
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("APP_URL must use HTTPS in production");
  return url.origin;
}
function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32)
    throw new Error("AUTH_SECRET must be at least 32 characters");
  return new TextEncoder().encode(value);
}
export function safeReturnPath(value: string | null | undefined) {
  return allowedReturnPath(value, appOrigin());
}
export async function currentGoogleViewer() {
  const token = (await cookies()).get("ccoc_google_session")?.value;
  if (!token) return null;
  const session = await db.googleViewerSession.findUnique({
    where: { id: hashToken(token) },
    select: {
      expiresAt: true,
      viewer: { select: { id: true, name: true, email: true } },
    },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return {
    id: session.viewer.id,
    name: session.viewer.name,
    email: session.viewer.email,
  };
}
export async function requireGoogleViewer() {
  const viewer = await currentGoogleViewer();
  if (!viewer) throw new Error("GOOGLE_SIGN_IN_REQUIRED");
  return viewer;
}
export async function createGoogleSession(viewerId: string) {
  const token = createHmac("sha256", secret())
      .update(randomBytes(32))
      .digest("hex"),
    expiresAt = new Date(Date.now() + 8 * 3600000);
  await db.googleViewerSession.create({
    data: { id: hashToken(token), viewerId, expiresAt },
  });
  (await cookies()).set("ccoc_google_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}
export async function beginGoogleFlow(next: string) {
  const state = randomBytes(32).toString("base64url"),
    nonce = randomBytes(32).toString("base64url"),
    verifier = randomBytes(48).toString("base64url");
  const signed = await new SignJWT({
    state,
    nonce,
    verifier,
    next: safeReturnPath(next),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("ccoc")
    .setAudience("google-flow")
    .setExpirationTime("10m")
    .sign(secret());
  (await cookies()).set("ccoc_google_flow", signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/google",
  });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${appOrigin()}/api/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
export async function consumeGoogleFlow(state: string | null) {
  const jar = await cookies(),
    signed = jar.get("ccoc_google_flow")?.value;
  jar.set("ccoc_google_flow", "", { path: "/api/google", maxAge: 0 });
  if (!signed || !state) throw new Error("Invalid sign-in request");
  const { payload } = await jwtVerify(signed, secret(), {
    algorithms: ["HS256"],
    issuer: "ccoc",
    audience: "google-flow",
  });
  if (
    payload.state !== state ||
    typeof payload.verifier !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.next !== "string"
  )
    throw new Error("Invalid sign-in request");
  return {
    verifier: payload.verifier,
    nonce: payload.nonce,
    next: safeReturnPath(payload.next),
  };
}
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
export async function verifyGoogleIdToken(token: string, nonce: string) {
  const { payload } = await jwtVerify(token, googleKeys, {
    algorithms: ["RS256"],
    audience: process.env.GOOGLE_CLIENT_ID,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    requiredClaims: ["exp", "iat", "sub", "email", "nonce"],
  });
  return verifiedGoogleClaims(payload, nonce);
}
