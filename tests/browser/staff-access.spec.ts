import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
const db = new PrismaClient();
test.afterAll(async () => {
  await db.$disconnect();
});
test("Staff creation assigns encoder, ignores role injection, and excludes viewers from staff login", async ({
  page,
  playwright,
}) => {
  const origin = { Origin: "http://localhost:3000" };
  expect(
    (
      await page.request.post("/api/auth", {
        headers: origin,
        data: {
          email: process.env.ADMIN_EMAIL,
          password: process.env.ADMIN_PASSWORD,
        },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Add user", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Role", { exact: true })).toHaveCount(0);
  await expect(
    dialog.getByText("Staff role: Encoder · Assigned automatically."),
  ).toBeVisible();
  const password = randomBytes(18).toString("hex");
  const email = `staff-access-${Date.now()}@example.test`;
  let id = "";
  const staff = await playwright.request.newContext({
    baseURL: "http://localhost:3000",
  });
  try {
    await dialog.getByLabel("Full name").fill("Staff access fixture");
    await dialog.getByLabel("Email address").fill(email);
    await dialog.getByLabel("Password (at least 12 characters)").fill(password);
    await dialog.getByRole("button", { name: "Save record" }).click();
    await expect(dialog).toHaveCount(0);
    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { role: true },
    });
    id = user.id;
    expect(user.role.name).toBe("ENCODER");
    expect(
      (
        await page.request.post("/api/data", {
          headers: origin,
          data: {
            entity: "user",
            id,
            data: {
              name: user.name,
              email,
              status: "ACTIVE",
              role: "SUPER_ADMIN",
            },
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await db.user.findUniqueOrThrow({
          where: { id },
          include: { role: true },
        })
      ).role.name,
    ).toBe("ENCODER");
    expect(
      (
        await staff.post("/api/auth", {
          headers: origin,
          data: { email, password },
        })
      ).status(),
    ).toBe(200);
    expect((await staff.get("/api/data")).status()).toBe(200);
    expect(
      (
        await staff.post("/api/data", {
          headers: origin,
          data: { entity: "user", data: {} },
        })
      ).status(),
    ).toBe(403);
    // Even an old VIEWER staff account with a valid password/session has no staff access.
    const legacyRole = await db.role.findUniqueOrThrow({
      where: { name: "VIEWER" },
    });
    await db.user.update({ where: { id }, data: { roleId: legacyRole.id } });
    expect((await staff.get("/api/data")).status()).toBe(401);
    expect(
      (
        await staff.post("/api/auth", {
          headers: origin,
          data: { email, password },
        })
      ).status(),
    ).toBe(401);
    const admin = await db.user.findUniqueOrThrow({
      where: { email: process.env.ADMIN_EMAIL },
      include: { role: true },
    });
    expect(admin.role.name).toBe("SUPER_ADMIN");
  } finally {
    await staff.dispose();
    if (!id) id = (await db.user.findUnique({ where: { email } }))?.id ?? "";
    if (id) {
      await db.auditLog.deleteMany({
        where: { OR: [{ userId: id }, { entityId: id }] },
      });
      await db.passwordReset.deleteMany({ where: { userId: id } });
      await db.user.delete({ where: { id } });
    }
  }
});
