import { db } from "./db";
import { hashToken } from "./auth";
let lastCleanup = 0;

/** Atomic fixed-window reservation; shared across app processes. */
export async function reserveAttempt(
  key: string,
  windowMs: number,
  limit: number,
) {
  if (Date.now() - lastCleanup >= 60000) {
    lastCleanup = Date.now();
    try {
      await db.loginAttempt.deleteMany({
        where: { expiresAt: { lte: new Date() } },
      });
    } catch (error) {
      lastCleanup = 0;
      throw error;
    }
  }
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "LoginAttempt" ("id", "count", "expiresAt")
    VALUES (${hashToken(key)}, 1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${windowMs} * INTERVAL '1 millisecond')
    ON CONFLICT ("id") DO UPDATE SET
      "count" = CASE WHEN "LoginAttempt"."expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1 ELSE LEAST("LoginAttempt"."count" + 1, ${limit + 1}) END,
      "expiresAt" = CASE WHEN "LoginAttempt"."expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN EXCLUDED."expiresAt" ELSE "LoginAttempt"."expiresAt" END
    RETURNING "count"`;
  return rows[0].count <= limit;
}
export function reserveExport(viewerId: string) {
  return reserveAttempt(`export:${viewerId}`, 60000, 10);
}
