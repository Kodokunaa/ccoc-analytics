import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes, createHash } from "node:crypto";
import ExcelJS from "exceljs";
const db = new PrismaClient();
const googleFixtures: string[] = [];
test.afterAll(async () => {
  for (const viewerId of googleFixtures) {
    await db.publicExportLog.deleteMany({ where: { viewerId } });
    await db.googleViewer.delete({ where: { id: viewerId } });
  }
  await db.$disconnect();
});
test("encoders can edit their records, password resets revoke sessions, and login is throttled", async ({
  request,
  playwright,
}) => {
  test.setTimeout(60000);
  const base = "http://localhost:3000",
    origin = { Origin: base };
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
  const password = randomBytes(18).toString("hex"),
    email = `encoder-${Date.now()}@example.test`;
  const data = {
    name: "Test encoder",
    email,
    password,
    role: "ENCODER",
    status: "ACTIVE",
  };
  const user = await (
    await request.post("/api/data", {
      headers: origin,
      data: { entity: "user", data },
    })
  ).json();
  expect(user.ok).toBe(true);
  const encoder = await playwright.request.newContext({ baseURL: base });
  let serviceId = "";
  try {
    expect(
      (
        await encoder.post("/api/auth", {
          headers: origin,
          data: { email, password },
        })
      ).status(),
    ).toBe(200);
    const own = await (
      await encoder.post("/api/data", {
        headers: origin,
        data: {
          entity: "service",
          data: {
            serviceDate: "2026-02-08",
            serviceType: "SUNDAY_SERVICE",
            serviceName: "Encoder test",
          },
        },
      })
    ).json();
    expect(own.ok).toBe(true);
    serviceId = own.record.id;
    const fields = {
      serviceDate: "2026-02-08",
      serviceType: "SUNDAY_SERVICE",
      serviceName: "Encoder edited",
    };
    expect(
      (
        await encoder.post("/api/data", {
          headers: origin,
          data: { entity: "service", id: serviceId, data: fields },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await encoder.post("/api/data", {
          headers: origin,
          data: { entity: "service", id: "sample-2026-1", data: fields },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await encoder.post("/api/data", {
          headers: origin,
          data: { entity: "service", id: serviceId, remove: true },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await encoder.post("/api/data", {
          headers: origin,
          data: { entity: "settings", data: {} },
        })
      ).status(),
    ).toBe(403);
    const newPassword = randomBytes(18).toString("hex");
    expect(
      (
        await request.post("/api/data", {
          headers: origin,
          data: {
            entity: "user",
            id: user.record.id,
            data: { ...data, password: newPassword },
          },
        })
      ).status(),
    ).toBe(200);
    expect((await encoder.get("/api/data")).status()).toBe(401);
    expect(
      (
        await encoder.post("/api/auth", {
          headers: origin,
          data: { email, password },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await encoder.post("/api/auth", {
          headers: origin,
          data: { email, password: newPassword },
        })
      ).status(),
    ).toBe(200);
    const badEmail = `login-limit-${Date.now()}@example.test`;
    for (let i = 0; i < 8; i++)
      expect(
        (
          await encoder.post("/api/auth", {
            headers: origin,
            data: { email: badEmail, password: "WrongPassword" },
          })
        ).status(),
      ).toBe(401);
    expect(
      (
        await encoder.post("/api/auth", {
          headers: origin,
          data: { email: badEmail, password: "WrongPassword" },
        })
      ).status(),
    ).toBe(429);
  } finally {
    await encoder.dispose();
    await db.auditLog.deleteMany({
      where: {
        OR: [
          { userId: user.record.id },
          { entityId: user.record.id },
          { entityId: serviceId },
        ],
      },
    });
    if (serviceId) await db.service.delete({ where: { id: serviceId } });
    await db.user.delete({ where: { id: user.record.id } });
  }
});
test("login, seeded dashboard, data entry, exports, roles, and mobile navigation", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const base = "http://localhost:3000";
  expect((await request.get("/api/data")).status()).toBe(401);
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Email address").fill(process.env.ADMIN_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Church overview" }),
  ).toBeVisible();
  await expect(page.locator(".kpi").first()).toContainText("223");
  await expect(page.locator(".kpi").nth(1)).toContainText("13,475.00");
  await expect(page.locator(".chart svg").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  const api = page.context().request;
  expect(
    (
      await api.get("/api/reports?format=excel&start=2026-01-01&end=2026-01-31")
    ).status(),
  ).toBe(401);
  const googleToken = randomBytes(32).toString("hex");
  const googleViewer = await db.googleViewer.create({
    data: {
      googleSubject: `staff-fixture-${Date.now()}`,
      email: "staff-test@example.test",
      name: "Staff Google fixture",
    },
  });
  googleFixtures.push(googleViewer.id);
  await db.googleViewerSession.create({
    data: {
      id: createHash("sha256").update(googleToken).digest("hex"),
      viewerId: googleViewer.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await page.context().addCookies([
    {
      name: "ccoc_google_session",
      value: googleToken,
      url: base,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const snapshot = await (await api.get("/api/data")).json();
  expect(JSON.stringify(snapshot)).not.toContain("passwordHash");
  expect(snapshot.services).toHaveLength(8);
  expect(snapshot).not.toHaveProperty("categories");
  const post = (data: unknown) =>
    api.post("/api/data", { headers: { Origin: base }, data });
  expect(
    (
      await api.post("/api/data", {
        headers: { Origin: "https://other.example" },
        data: { entity: "service" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await post({
        entity: "service",
        data: {
          serviceDate: "2026-02-01",
          serviceName: "Bad data",
          serviceType: "SUNDAY_SERVICE",
          attendance: {
            totalAttendance: -1,
            adultCount: 0,
            childrenCount: 0,
            memberCount: 0,
            visitorCount: 0,
          },
        },
      })
    ).status(),
  ).toBe(400);
  await page.getByRole("button", { name: "Add service", exact: true }).click();
  await page.getByLabel("Service date", { exact: true }).fill("2026-02-01");
  await page
    .getByLabel("Service name", { exact: true })
    .fill("Integration test gathering");
  await page.getByLabel("Include attendance").check();
  await page.getByLabel("Total attendance", { exact: true }).fill("20");
  await page.getByLabel("Adults", { exact: true }).fill("15");
  await page.getByLabel("Children", { exact: true }).fill("5");
  await page.getByLabel("Include giving").check();
  await expect(page.getByLabel("Giving category")).toHaveCount(0);
  await page.getByLabel("Amount (PHP)").fill("1500.50");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "Record saved successfully",
  );
  const changed = await (await api.get("/api/data")).json(),
    service = changed.services.find(
      (s: { serviceName: string }) =>
        s.serviceName === "Integration test gathering",
    );
  expect(service.attendance.totalAttendance).toBe(20);
  expect(
    changed.logs.some(
      (l: { entity: string; entityId: string }) =>
        l.entity === "attendance" && l.entityId === service.attendance.id,
    ),
  ).toBe(true);
  expect(Number(service.giving[0].amount)).toBe(1500.5);
  const updated = await post({
    entity: "attendance",
    data: {
      serviceId: service.id,
      totalAttendance: 25,
      adultCount: 20,
      childrenCount: 5,
      memberCount: 20,
      visitorCount: 5,
    },
  });
  expect(updated.status()).toBe(200);
  expect(
    (
      await post({
        entity: "giving",
        id: service.giving[0].id,
        data: {
          serviceId: service.id,
          amount: 1750,
          notes: "Updated test",
        },
      })
    ).status(),
  ).toBe(200);
  const target = await (
    await post({
      entity: "target",
      data: {
        type: "ATTENDANCE",
        periodType: "MONTHLY",
        targetValue: 100,
        startDate: "2026-02-01",
        endDate: "2026-02-28",
      },
    })
  ).json();
  expect(target.ok).toBe(true);
  expect(
    (
      await post({ entity: "target", id: target.record.id, remove: true })
    ).status(),
  ).toBe(200);
  const excel = await api.get(
    "/api/reports?format=excel&start=2026-01-01&end=2026-01-31",
  );
  expect(excel.status()).toBe(200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    (await excel.body()) as unknown as Parameters<typeof book.xlsx.load>[0],
  );
  expect(book.worksheets.map((s) => s.name)).toEqual([
    "Summary",
    "Attendance",
    "Giving",
  ]);
  expect(book.getWorksheet("Attendance")!.rowCount).toBe(5);
  const pdf = await api.get(
    "/api/reports?format=pdf&start=2026-01-01&end=2026-01-31",
  );
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  for (const section of [
    "services",
    "attendance",
    "giving",
    "analytics/attendance",
    "analytics/financial",
    "analytics/combined",
    "reports",
    "targets",
    "users",
    "audit-logs",
    "settings",
  ]) {
    await page.goto(`/admin/${section}`);
    await expect(page.locator(".skeleton")).toHaveCount(0);
    await expect(page.locator(".page-heading h1")).toBeVisible();
  }
  await page.goto("/admin/dashboard");
  await expect(page.locator(".skeleton")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".sidebar")).toHaveClass(/is-open/);
  await page.getByRole("link", { name: "Services", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Services", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".skeleton")).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({
    path: "test-results/services-mobile.png",
    fullPage: true,
  });
  const credentials = {
    email: `test-viewer-${Date.now()}@example.test`,
    password: randomBytes(18).toString("hex"),
  };
  const viewer = await (
    await post({
      entity: "user",
      data: {
        ...credentials,
        name: "Test viewer",
        role: "VIEWER",
        status: "ACTIVE",
      },
    })
  ).json();
  expect(viewer.ok).toBe(true);
  expect(
    (
      await db.user.findUniqueOrThrow({
        where: { id: viewer.record.id },
        include: { role: true },
      })
    ).role.name,
  ).toBe("ENCODER");
  const ctx = await page.context().browser()!.newContext();
  const guest = ctx.request;
  try {
    expect(
      (
        await guest.post(`${base}/api/auth`, {
          headers: { Origin: base },
          data: credentials,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await guest.post(`${base}/api/data`, {
          headers: { Origin: base },
          data: { entity: "user", data: {} },
        })
      ).status(),
    ).toBe(403);
    const viewerData = await (await guest.get(`${base}/api/data`)).json();
    expect(viewerData.users).toHaveLength(0);
    expect(viewerData.logs).toHaveLength(0);
    await ctx.addCookies([
      {
        name: "ccoc_google_session",
        value: googleToken,
        url: base,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    expect(
      (
        await guest.get(
          `${base}/api/reports?format=excel&start=2026-01-01&end=2026-01-31`,
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await post({
          entity: "user",
          id: viewer.record.id,
          data: {
            ...credentials,
            name: "Test viewer",
            role: "VIEWER",
            status: "INACTIVE",
            password: undefined,
          },
        })
      ).status(),
    ).toBe(200);
    expect((await guest.get(`${base}/api/data`)).status()).toBe(401);
  } finally {
    await ctx.close();
    await db.auditLog.deleteMany({
      where: {
        OR: [{ userId: viewer.record.id }, { entityId: viewer.record.id }],
      },
    });
    await db.user.delete({ where: { id: viewer.record.id } });
  }
  expect(
    (await post({ entity: "service", id: service.id, remove: true })).status(),
  ).toBe(200);
  expect((await (await api.get("/api/data")).json()).services).toHaveLength(8);
  await db.auditLog.deleteMany({ where: { entityId: service.id } });
  await db.attendanceRecord.deleteMany({ where: { serviceId: service.id } });
  await db.givingRecord.deleteMany({ where: { serviceId: service.id } });
  await db.service.delete({ where: { id: service.id } });
  expect(
    (await api.delete("/api/auth", { headers: { Origin: base } })).status(),
  ).toBe(200);
  expect((await api.get("/api/data")).status()).toBe(401);
});
