import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";
const db = new PrismaClient();
const viewerIds: string[] = [];
test.afterAll(async () => {
  for (const viewerId of viewerIds) {
    await db.publicExportLog.deleteMany({ where: { viewerId } });
    await db.googleViewer.delete({ where: { id: viewerId } });
  }
  await db.$disconnect();
});
test("Guests browse monthly reports; Google sessions unlock downloads but never staff access", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Our church, in the open." }),
  ).toBeVisible();
  await expect(page.locator(".kpi").first()).toContainText("223");
  await expect(page.locator(".chart svg").first()).toBeVisible();
  await expect(page.getByLabel("Service type", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Export report", exact: true })
    .click();
  await page.getByLabel("File format").selectOption("pptx");
  await expect(page.getByLabel("File format")).toHaveValue("pptx");
  await expect(page.getByLabel("Export contents")).toHaveValue("month");
  await expect(page.getByRole("dialog")).toContainText(
    "Three slides per month",
  );
  await page.getByLabel("File format").selectOption("xlsx");
  await page.getByRole("button", { name: "Close export" }).click();
  expect(
    await page
      .getByRole("link")
      .evaluateAll((links) =>
        links
          .map((l) => l.getAttribute("href"))
          .filter((h) => h?.startsWith("/admin")),
      ),
  ).toEqual([]);
  await expect(page.getByText(/sign up|signup|register/i)).toHaveCount(0);
  await page.screenshot({
    path: "test-results/transparency-desktop.png",
    fullPage: true,
  });
  const publicResponse = await request.get("/api/transparency?year=2026"),
    publicData = await publicResponse.json();
  expect(publicResponse.status()).toBe(200);
  expect(publicData.months).toHaveLength(12);
  const serialized = JSON.stringify(publicData);
  for (const field of [
    "passwordHash",
    "createdBy",
    "creator",
    "notes",
    "roleId",
    "ipAddress",
    "category",
    "categoryId",
  ])
    expect(serialized).not.toContain(`"${field}"`);
  expect((await request.get("/api/data")).status()).toBe(401);
  expect(
    (
      await request.get(
        "/api/transparency/export?scope=year&year=2026&month=2026-01",
      )
    ).status(),
  ).toBe(401);
  await page
    .getByRole("button", { name: "Export report", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Sign in with Google to download",
  );
  await expect(
    page.getByRole("button", { name: "Download XLSX", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close export" }).click();
  await page
    .getByRole("button", { name: "Monthly reports", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(12);
  await expect(page.getByText("A report for every month")).toBeVisible();
  await page
    .getByRole("button", { name: "Service records", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "test-results/transparency-mobile.png",
    fullPage: true,
  });
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/signin");
  await expect(
    page.getByRole("heading", { name: "Take the report with you." }),
  ).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  const callback = await request.get(
    "/api/google/callback?state=invalid&code=invalid",
    { maxRedirects: 0 },
  );
  expect(callback.status()).toBe(307);
  expect(callback.headers().location).toContain("/signin?error=failed");
  const token = randomBytes(32).toString("hex"),
    viewer = await db.googleViewer.create({
      data: {
        googleSubject: `fixture-${Date.now()}`,
        email: "verified-test@example.test",
        name: "Google viewer fixture",
      },
    });
  viewerIds.push(viewer.id);
  await db.googleViewerSession.create({
    data: {
      id: createHash("sha256").update(token).digest("hex"),
      viewerId: viewer.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await page.context().addCookies([
    {
      name: "ccoc_google_session",
      value: token,
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const api = page.context().request;
  expect((await api.get("/api/data")).status()).toBe(401);
  expect(
    (
      await api.post("/api/data", {
        headers: { Origin: "http://localhost:3000" },
        data: { entity: "service", data: {} },
      })
    ).status(),
  ).toBe(401);
  const annual = await api.get(
    "/api/transparency/export?scope=year&year=2026&month=2026-01",
  );
  expect(annual.status()).toBe(200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    (await annual.body()) as unknown as Parameters<typeof book.xlsx.load>[0],
  );
  expect(book.worksheets).toHaveLength(13);
  expect(book.worksheets.map((s) => s.name)).toContain("December");
  expect(book.getWorksheet("January")!.getCell("B6").value).toBe(223);
  expect(book.getWorksheet("February")!.getCell("B19").value).toBe(
    "No services recorded",
  );
  const monthly = await api.get(
    "/api/transparency/export?scope=month&year=2026&month=2026-01",
  );
  expect(monthly.status()).toBe(200);
  const monthlyBook = new ExcelJS.Workbook();
  await monthlyBook.xlsx.load(
    (await monthly.body()) as unknown as Parameters<
      typeof monthlyBook.xlsx.load
    >[0],
  );
  expect(monthlyBook.worksheets.map((s) => s.name)).toEqual([
    "Summary",
    "Attendance",
    "Giving",
  ]);
  expect(monthlyBook.getWorksheet("Attendance")!.rowCount).toBe(5);
  expect(monthlyBook.getWorksheet("Giving")!.getRow(1).values).toEqual([
    undefined,
    "Date",
    "Service",
    "Amount (PHP)",
  ]);
  await page.goto("/?month=2026-01&year=2026");
  await page
    .getByRole("button", { name: "Export report", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download XLSX", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe(
    "city-church-2026-01-month.xlsx",
  );
  await expect(page.getByRole("dialog").getByRole("status")).toContainText(
    "Your report is ready",
  );
  await expect(
    page.getByRole("link", { name: /Save file again/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close export" }).click();
  expect(
    await db.publicExportLog.count({ where: { viewerId: viewer.id } }),
  ).toBe(3);
  await page
    .getByRole("button", { name: "Export report", exact: true })
    .click();
  await page.getByLabel("File format").selectOption("pptx");
  await expect(page.getByRole("dialog")).toContainText(
    "One set of data per slide",
  );
  const pptDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download PowerPoint", exact: true })
    .click();
  expect((await pptDownload).suggestedFilename()).toBe(
    "city-church-attendance-2026-01-month.pptx",
  );
  await page.getByRole("button", { name: "Close export" }).click();
  const presentation = await api.get(
    "/api/transparency/export?scope=month&year=2026&month=2026-01&format=pptx",
  );
  expect(presentation.status()).toBe(200);
  expect(presentation.headers()["content-type"]).toContain(
    "presentationml.presentation",
  );
  const zip = await JSZip.loadAsync(await presentation.body());
  expect(
    Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name),
    ),
  ).toHaveLength(3);
  const titles = [
    "Attendance numbers",
    "Attendance graph",
    "Attendance comparison",
  ];
  for (let i = 0; i < titles.length; i++)
    expect(
      await zip.file(`ppt/slides/slide${i + 1}.xml`)!.async("string"),
    ).toContain(titles[i]);
  const attendanceSlide = await zip
    .file("ppt/slides/slide1.xml")!
    .async("string");
  expect(attendanceSlide).toContain("223");
  const comparisonSlide = await zip
    .file("ppt/slides/slide3.xml")!
    .async("string");
  expect(comparisonSlide).toContain("200");
  expect(comparisonSlide).toContain("11.5%");
  expect(comparisonSlide).toContain("December 2025");
  expect(comparisonSlide).toContain("January 2025");
  expect(comparisonSlide).toContain("No baseline");
  expect(
    Object.keys(zip.files).filter((name) =>
      /^ppt\/charts\/chart\d+\.xml$/.test(name),
    ),
  ).toHaveLength(1);
  const annualPpt = await api.get(
    "/api/transparency/export?scope=year&year=2026&month=2026-01&format=pptx",
  );
  expect(annualPpt.status()).toBe(200);
  const annualZip = await JSZip.loadAsync(await annualPpt.body());
  expect(
    Object.keys(annualZip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name),
    ),
  ).toHaveLength(36);
  await api.delete("/api/google/session", {
    headers: { Origin: "http://localhost:3000" },
  });
  expect(
    (
      await api.get(
        "/api/transparency/export?scope=month&year=2026&month=2026-01",
      )
    ).status(),
  ).toBe(401);
  expect(
    (
      await api.get(
        "/api/transparency/export?scope=month&year=2026&month=2026-01&format=pptx",
      )
    ).status(),
  ).toBe(401);
});

test("Export picker preserves a chosen month and year, shows failures, and keeps a reusable download link", async ({
  page,
}) => {
  const token = randomBytes(32).toString("hex");
  const viewer = await db.googleViewer.create({
    data: {
      googleSubject: `period-fixture-${Date.now()}`,
      email: "period-test@example.test",
      name: "Export period fixture",
    },
  });
  viewerIds.push(viewer.id);
  await db.googleViewerSession.create({
    data: {
      id: createHash("sha256").update(token).digest("hex"),
      viewerId: viewer.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await page.context().addCookies([
    {
      name: "ccoc_google_session",
      value: token,
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto(
    "/?month=2026-01&year=2026&export=month&format=pptx&report=both",
  );
  await page.getByLabel("Export year", { exact: true }).selectOption("2025");
  await page.getByLabel("Export month", { exact: true }).selectOption("01");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Selected period: January 2025");
  await page.route("**/api/transparency/export?*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.fulfill({
      status: 503,
      contentType: "text/html",
      body: "Temporarily unavailable",
    });
  });
  await page
    .getByRole("button", { name: "Download PowerPoint", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preparing report…", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText(
    "Unable to prepare the report",
  );
  await page.unroute("**/api/transparency/export?*");
  await page.setViewportSize({ width: 320, height: 844 });
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download PowerPoint", exact: true })
    .click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("city-church-both-2025-01-month.pptx");
  await expect(dialog.getByRole("status")).toContainText(
    "Your report is ready",
  );
  const retry = dialog.getByRole("link", { name: /Save file again/ });
  await expect(retry).toBeVisible();
  await expect(retry).toBeInViewport();
  await page.screenshot({
    path: "test-results/export-ready-mobile.png",
    fullPage: true,
  });
  const retryDownload = page.waitForEvent("download");
  await retry.click();
  expect((await retryDownload).suggestedFilename()).toBe(
    file.suggestedFilename(),
  );
  await page.getByLabel("Export contents").selectOption("year");
  await expect(page.getByLabel("Export month", { exact: true })).toHaveCount(0);
  await expect(dialog).toContainText("Selected period: January–December 2025");
  await page.setViewportSize({ width: 320, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "test-results/export-feedback-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close export" }).click();
  await page.context().clearCookies();
  await page.goto(
    "/?month=2026-01&year=2026&export=month&format=pptx&report=both",
  );
  await page.getByLabel("Export year", { exact: true }).selectOption("2025");
  await page.getByLabel("Export month", { exact: true }).selectOption("09");
  const next = new URL(
    "http://localhost:3000" +
      (await page.getByRole("dialog").getByRole("link").getAttribute("href")),
  ).searchParams.get("next");
  expect(next).toContain("month=2025-09&year=2025");
  expect(next).toContain("report=both");
});
