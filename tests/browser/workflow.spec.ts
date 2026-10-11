import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import ExcelJS from "exceljs";
import { importHeaders } from "../../lib/import-data";
const db = new PrismaClient(),
  origin = { Origin: "http://localhost:3000" };
test.afterAll(async () => {
  await db.$disconnect();
});
test("Monthly review protects Sundays, snapshots comparisons, restores archives, and imports atomically", async ({
  page,
}) => {
  test.setTimeout(120000);
  const request = page.request;
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
  const month = "2024-02",
    dates = ["2024-02-04", "2024-02-11", "2024-02-18", "2024-02-25"];
  const attendance = {
    totalAttendance: 20,
    adultCount: 12,
    childrenCount: 8,
    memberCount: 18,
    visitorCount: 2,
  };
  const rows = dates.map((serviceDate) => ({
    serviceDate,
    serviceName: "Workflow fixture",
    attendance,
    giving: [{ amount: 1.25 }],
    notes: "Private workflow notes",
  }));
  let viewerId = "";
  const createdIds: string[] = [];
  expect(
    await db.service.count({
      where: {
        serviceDate: {
          in: [...dates, "2024-03-03", "2023-02-05"].map((d) => new Date(d)),
        },
      },
    }),
    "Use a development database with unused workflow fixture dates",
  ).toBe(0);
  expect(
    await db.reportMonth.count({
      where: { month: { in: [month, "2024-03", "2023-02"] } },
    }),
  ).toBe(0);
  expect(await db.reportArtifact.count({ where: { month } })).toBe(0);
  try {
    expect(
      (
        await request.post("/api/import-services", {
          headers: origin,
          data: { records: [{ ...rows[0], serviceDate: "2024-02-05" }] },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post("/api/import-services", {
          headers: origin,
          data: { records: [rows[0], rows[0]] },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post("/api/report-workflow", {
          headers: origin,
          data: { action: "approve", month },
        })
      ).status(),
    ).toBe(400);
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Sunday services");
    sheet.addRow(importHeaders);
    rows.forEach((r) =>
      sheet.addRow([
        r.serviceDate,
        r.serviceName,
        20,
        12,
        8,
        18,
        2,
        1.25,
        r.notes,
      ]),
    );
    const preview = await request.post("/api/import-services", {
      headers: origin,
      multipart: {
        file: {
          name: "history.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          buffer: Buffer.from(await book.xlsx.writeBuffer()),
        },
      },
    });
    expect(preview.status()).toBe(200);
    const parsed = await preview.json();
    expect(parsed.records).toHaveLength(4);
    expect(parsed.conflicts).toEqual([]);
    expect(
      (
        await request.post("/api/import-services", {
          headers: origin,
          data: { records: parsed.records },
        })
      ).status(),
    ).toBe(200);
    const records = await db.service.findMany({
      where: { serviceDate: { in: dates.map((d) => new Date(d)) } },
    });
    createdIds.push(...records.map((r) => r.id));
    const id = records.find((r) =>
      r.serviceDate.toISOString().startsWith(dates[0]),
    )!.id;
    // A conflict in the second row must roll back the first row too.
    expect(
      (
        await request.post("/api/import-services", {
          headers: origin,
          data: {
            records: [{ ...rows[0], serviceDate: "2024-03-03" }, rows[1]],
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      await db.service.count({
        where: { serviceDate: new Date("2024-03-03") },
      }),
    ).toBe(0);
    expect(
      (
        await request.post("/api/data", {
          headers: origin,
          data: { entity: "service", data: rows[0] },
        })
      ).status(),
    ).toBe(409);
    expect(
      (
        await request.post("/api/data", {
          headers: origin,
          data: { entity: "service", id, remove: true },
        })
      ).status(),
    ).toBe(200);
    const duplicate = await (
      await request.post("/api/data", {
        headers: origin,
        data: {
          entity: "service",
          data: { serviceDate: dates[0], serviceName: "Replacement" },
        },
      })
    ).json();
    expect(
      (
        await request.post("/api/report-workflow", {
          headers: origin,
          data: { action: "restore", month, id },
        })
      ).status(),
    ).toBe(409);
    await db.service.delete({ where: { id: duplicate.record.id } });
    expect(
      (
        await request.post("/api/report-workflow", {
          headers: origin,
          data: { action: "restore", month, id },
        })
      ).status(),
    ).toBe(200);
    const baseline = await (
      await request.post("/api/data", {
        headers: origin,
        data: {
          entity: "service",
          data: {
            serviceDate: "2023-02-05",
            serviceName: "Baseline",
            attendance: {
              ...attendance,
              totalAttendance: 10,
              adultCount: 6,
              childrenCount: 4,
              memberCount: 8,
            },
            giving: [{ amount: 2 }],
          },
        },
      })
    ).json();
    createdIds.push(baseline.record.id);
    expect(
      (
        await request.post("/api/report-workflow", {
          headers: origin,
          data: { action: "approve", month },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.post("/api/data", {
          headers: origin,
          data: {
            entity: "attendance",
            data: { serviceId: id, ...attendance, totalAttendance: 21 },
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post("/api/data", {
          headers: origin,
          data: { entity: "service", id, remove: true },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post("/api/data", {
          headers: origin,
          data: {
            entity: "attendance",
            data: {
              serviceId: baseline.record.id,
              ...attendance,
              totalAttendance: 99,
            },
          },
        })
      ).status(),
    ).toBe(200);
    const slides = await (
      await request.get(`/api/report-preview?month=${month}`)
    ).json();
    expect(slides.slides).toHaveLength(6);
    expect(slides.approved).toBe(true);
    expect(slides.slides[2].rows[3][1]).toBe("10");
    expect(JSON.stringify(slides)).not.toContain("Private workflow notes");
    const viewer = await db.googleViewer.create({
      data: {
        googleSubject: `workflow-${randomBytes(8).toString("hex")}`,
        email: "workflow@example.test",
        name: "Workflow viewer",
      },
    });
    viewerId = viewer.id;
    const token = randomBytes(32).toString("hex");
    await db.googleViewerSession.create({
      data: {
        id: createHash("sha256").update(token).digest("hex"),
        viewerId,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await page.context().addCookies([
      {
        name: "ccoc_google_session",
        value: token,
        domain: "localhost",
        path: "/",
      },
    ]);
    const file = await request.get(
      `/api/transparency/export?scope=month&format=pptx&year=2024&month=${month}`,
    );
    expect(file.status()).toBe(200);
    const artifact = await db.reportArtifact.findFirstOrThrow({
      where: { month },
      orderBy: { createdAt: "desc" },
    });
    expect(artifact.approved).toBe(true);
    const archived = await request.get(`/api/report-archive/${artifact.id}`);
    expect(archived.status()).toBe(200);
    expect(
      createHash("sha256")
        .update(await archived.body())
        .digest("hex"),
    ).toBe(artifact.checksum);
    await page.goto("/admin/reports");
    await page.getByLabel("Year", { exact: true }).selectOption("2024");
    await page.getByLabel("Month", { exact: true }).selectOption("02");
    await expect(page.getByText("Monthly review · 2024-02")).toBeVisible();
    await page
      .getByRole("button", { name: "Preview monthly PowerPoint" })
      .click();
    await expect(
      page.getByRole("region", { name: "PowerPoint content preview" }),
    ).toBeVisible();
    expect(
      await page
        .locator(".slide-preview th")
        .first()
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe("rgb(255, 255, 255)");
    await page.getByRole("button", { name: "Next slide" }).click();
    await expect(
      page.getByRole("heading", { name: "Attendance graph", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    expect(
      (
        await request.post("/api/report-workflow", {
          headers: origin,
          data: { action: "reopen", month },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await request.post("/api/data", {
          headers: origin,
          data: {
            entity: "attendance",
            data: { serviceId: id, ...attendance, totalAttendance: 21 },
          },
        })
      ).status(),
    ).toBe(200);
    expect(
      (await request.get(`/api/report-archive/${artifact.id}`)).status(),
    ).toBe(200);
  } finally {
    const ids = createdIds;
    await db.attendanceRecord.deleteMany({ where: { serviceId: { in: ids } } });
    await db.givingRecord.deleteMany({ where: { serviceId: { in: ids } } });
    await db.service.deleteMany({ where: { id: { in: ids } } });
    await db.reportMonth.deleteMany({
      where: { month: { in: [month, "2024-03", "2023-02"] } },
    });
    await db.reportArtifact.deleteMany({ where: { month } });
    if (viewerId) {
      await db.publicExportLog.deleteMany({ where: { viewerId } });
      await db.googleViewer.delete({ where: { id: viewerId } });
    }
  }
});
test("Password reset links expire, work once, and revoke staff sessions", async ({
  request,
}) => {
  const admin = await db.user.findUniqueOrThrow({
    where: { email: process.env.ADMIN_EMAIL },
  });
  const role = await db.role.findUniqueOrThrow({ where: { name: "ENCODER" } });
  const user = await db.user.create({
    data: {
      name: "Reset fixture",
      email: `reset-${Date.now()}@example.test`,
      passwordHash: admin.passwordHash,
      roleId: role.id,
    },
  });
  const token = randomBytes(32).toString("base64url"),
    expired = randomBytes(32).toString("base64url"),
    hash = (v: string) => createHash("sha256").update(v).digest("hex");
  try {
    await db.passwordReset.createMany({
      data: [
        {
          tokenHash: hash(token),
          userId: user.id,
          expiresAt: new Date(Date.now() + 60000),
        },
        {
          tokenHash: hash(expired),
          userId: user.id,
          expiresAt: new Date(Date.now() - 60000),
        },
      ],
    });
    await db.session.create({
      data: {
        id: randomBytes(32).toString("hex"),
        userId: user.id,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    expect(
      (
        await request.patch("/api/password-reset", {
          headers: origin,
          data: { token: expired, password: "Reset-password-1234" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.patch("/api/password-reset", {
          headers: origin,
          data: { token, password: "Reset-password-1234" },
        })
      ).status(),
    ).toBe(200);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(await db.passwordReset.count({ where: { userId: user.id } })).toBe(
      0,
    );
    expect(
      (
        await request.patch("/api/password-reset", {
          headers: origin,
          data: { token, password: "Another-password-1234" },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post("/api/auth", {
          headers: origin,
          data: { email: user.email, password: "Reset-password-1234" },
        })
      ).status(),
    ).toBe(200);
  } finally {
    await db.passwordReset.deleteMany({ where: { userId: user.id } });
    await db.auditLog.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});
