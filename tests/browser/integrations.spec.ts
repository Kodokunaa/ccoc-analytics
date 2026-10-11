import { test, expect } from "@playwright/test";

test("Motion tabs preserve contrast, reduced motion and mobile layout", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Transparency views" });
  await tabs.getByRole("button", { name: "Monthly reports" }).click();
  await expect(
    tabs.getByRole("button", { name: "Monthly reports" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(tabs.locator(".tab-indicator")).toHaveCount(1);
  expect(
    await tabs
      .locator(".active .tab-label")
      .evaluate((el) => getComputedStyle(el).color),
  ).toBe("rgb(255, 255, 255)");
  expect(
    await tabs
      .locator(".tab-indicator")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(0, 127, 120)");
  expect(
    await tabs
      .locator("button.active")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(0, 127, 120)");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("Staff sign-in fits narrow screens and tab fills stay local during motion", async ({
  page,
}) => {
  for (const width of [320, 390, 650]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/admin/login");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("heading", { name: "Every number tells a story." }),
    ).toBeVisible();
    expect(
      await page
        .getByRole("link", { name: "Forgot password?" })
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Transparency views" });
  for (const name of ["Monthly reports", "Service records", "Overview"]) {
    await tabs.getByRole("button", { name, exact: true }).click();
    const colors = await tabs.evaluate((el) =>
      [...el.querySelectorAll("button")].map((button) => ({
        selected: button.getAttribute("aria-current") === "page",
        fill: getComputedStyle(button).backgroundColor,
        text: getComputedStyle(button.querySelector(".tab-label")!).color,
      })),
    );
    for (const color of colors) {
      expect(color.text).toBe(
        color.selected ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)",
      );
      if (color.selected) expect(color.fill).toBe("rgb(0, 127, 120)");
      else expect(color.fill).not.toBe("rgb(0, 127, 120)");
    }
  }
});

test("Manus assistant requires staff/admin authentication and fails cleanly without a key", async ({
  page,
}) => {
  const request = page.request;
  expect((await request.get("/api/manus-report?month=2026-01")).status()).toBe(
    401,
  );
  expect(
    (
      await request.post("/api/manus-report", {
        data: { action: "create", month: "2026-01" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/auth", {
        headers: { Origin: "http://localhost:3000" },
        data: {
          email: process.env.ADMIN_EMAIL,
          password: process.env.ADMIN_PASSWORD,
        },
      })
    ).status(),
  ).toBe(200);
  expect((await request.get("/api/manus-report?month=bad")).status()).toBe(400);
  await page.goto("/admin/reports");
  await expect(
    page.getByRole("progressbar", { name: "Monthly data completeness" }),
  ).toBeVisible();
  const assistant = page.getByRole("region", {
    name: "Monthly AI report assistant",
  });
  await page.getByText("AI commentary", { exact: true }).click();
  await expect(assistant).toBeVisible();
  // Never create a live provider task in automated tests, even if a key is configured.
  if (!process.env.MANUS_API_KEY?.trim()) {
    await expect(
      assistant.getByRole("button", { name: "Draft with Manus" }),
    ).toBeDisabled();
    await expect(assistant.getByText(/Manus is not configured/)).toBeVisible();
    const res = await request.post("/api/manus-report", {
      headers: { Origin: "http://localhost:3000" },
      data: { action: "create", month: "2026-01" },
    });
    expect(res.status()).toBe(503);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(assistant).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/integrations-mobile.png",
    fullPage: true,
  });
});
