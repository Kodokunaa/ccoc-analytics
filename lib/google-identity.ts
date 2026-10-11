import type { JWTPayload } from "jose";

export function allowedReturnPath(
  value: string | null | undefined,
  origin: string,
) {
  try {
    const u = new URL(value || "/", origin);
    return u.origin === origin && ["/", "/admin/reports"].includes(u.pathname)
      ? u.pathname + u.search
      : "/";
  } catch {
    return "/";
  }
}
/** Use only after signature, issuer, audience and expiry verification. */
export function verifiedGoogleClaims(payload: JWTPayload, nonce: string) {
  if (
    !nonce ||
    payload.nonce !== nonce ||
    payload.email_verified !== true ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    typeof payload.email !== "string" ||
    !payload.email
  )
    throw new Error("Unverified Google identity");
  return {
    googleSubject: payload.sub,
    email: payload.email,
    name:
      typeof payload.name === "string" && payload.name
        ? payload.name
        : payload.email.split("@")[0],
  };
}
