import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
const db = new PrismaClient();
test("Configured Google flow uses PKCE and rejects state replay", async ({
  request,
}) => {
  test.skip(
    !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET,
    "OAuth credentials are not configured",
  );
  const started = await request.get(
    "/api/google/start?next=%2F%2Fevil.example",
    { maxRedirects: 0 },
  );
  expect(started.status()).toBe(307);
  const destination = new URL(started.headers().location);
  expect(destination.origin).toBe("https://accounts.google.com");
  expect(destination.searchParams.get("code_challenge_method")).toBe("S256");
  expect(destination.searchParams.get("scope")).toBe("openid email profile");
  const callback = `/api/google/callback?error=access_denied&state=${encodeURIComponent(destination.searchParams.get("state")!)}`;
  const cancelled = await request.get(callback, { maxRedirects: 0 });
  expect(cancelled.headers().location).toContain(
    "/signin?error=cancelled&next=%2F",
  );
  const replay = await request.get(callback, { maxRedirects: 0 });
  expect(replay.headers().location).toContain("/signin?error=failed");
});
test("Audit regressions: minimal snapshots, safe errors, strict dates and atomic export limits", async ({
  request,
}) => {
  test.setTimeout(60000);
  const origin = { Origin: "http://localhost:3000" };
  expect(
    (
      await request.post("/api/auth", {
        headers: origin,
        data: {
          email: process.env.ADMIN_EMAIL,
          password: process.env.ADMIN_PASSWORD,
        },
      })
    ).status(),
  ).toBe(200);
  const dashboard = await request.get("/api/data?section=dashboard");
  expect(dashboard.headers()["cache-control"]).toContain("no-store");
  const snapshot = await dashboard.json();
  expect(snapshot.users).toEqual([]);
  expect(snapshot.logs).toEqual([]);
  expect(snapshot.services).toHaveLength(8);
  const invalid = await request.post("/api/data", {
    headers: origin,
    data: {
      entity: "user",
      id: "nonexistent-user",
      data: {
        name: "Test",
        email: "nonexistent@example.test",
        role: "VIEWER",
        status: "ACTIVE",
      },
    },
  });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).error).toBe(
    "Unable to save the record. Please try again.",
  );
  const publicData = await (
    await request.get("/api/transparency?year=2026")
  ).json();
  expect(publicData.months).toHaveLength(12);
  for (const month of publicData.months) {
    expect(month).not.toHaveProperty("records");
    expect(month).not.toHaveProperty("previousRecords");
  }
  const token = randomBytes(32).toString("hex");
  const viewer = await db.googleViewer.create({
    data: {
      googleSubject: `audit-${Date.now()}`,
      email: "audit@example.test",
      name: "Audit fixture",
    },
  });
  const key = createHash("sha256").update(`export:${viewer.id}`).digest("hex");
  try {
    await db.googleViewerSession.create({
      data: {
        id: createHash("sha256").update(token).digest("hex"),
        viewerId: viewer.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await request.storageState().then(async (state) => {
      const cookies = state.cookies
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
      const headers = { Cookie: `${cookies}; ccoc_google_session=${token}` };
      const badDate = await request.get(
        "/api/reports?format=excel&start=2026-02-30&end=2026-03-31",
        { headers },
      );
      expect(badDate.status()).toBe(400);
      await db.loginAttempt.create({
        data: { id: key, count: 9, expiresAt: new Date(Date.now() + 60000) },
      });
      const exports = await Promise.all(
        Array.from({ length: 6 }, () =>
          request.get(
            "/api/transparency/export?scope=month&year=2026&month=2026-01",
            { headers },
          ),
        ),
      );
      expect(exports.filter((r) => r.status() === 200)).toHaveLength(1);
      expect(exports.filter((r) => r.status() === 429)).toHaveLength(5);
      const limitedStaff = await request.get(
        "/api/reports?format=excel&start=2026-01-01&end=2026-01-31",
        { headers },
      );
      expect(limitedStaff.status()).toBe(429);
      expect(
        (await db.loginAttempt.findUniqueOrThrow({ where: { id: key } })).count,
      ).toBe(11);
      await db.loginAttempt.update({
        where: { id: key },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(
        (
          await request.get(
            "/api/transparency/export?scope=month&year=2026&month=2026-01",
            { headers },
          )
        ).status(),
      ).toBe(200);
    });
  } finally {
    await db.publicExportLog.deleteMany({ where: { viewerId: viewer.id } });
    await db.googleViewer.delete({ where: { id: viewer.id } });
    await db.loginAttempt.deleteMany({ where: { id: key } });
    await db.$disconnect();
  }
});
