import type { NextRequest } from "next/server";
import { isIP } from "node:net";
// Forwarded addresses are trusted only when a deployment proxy overwrites them.
export function auditContext(request: NextRequest) {
  const forwarded =
    process.env.TRUST_PROXY === "true"
      ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      : undefined;
  return { ipAddress: forwarded && isIP(forwarded) ? forwarded : null };
}
