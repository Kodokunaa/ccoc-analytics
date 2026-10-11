import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allowedReturnPath,
  verifiedGoogleClaims,
} from "../lib/google-identity";
import {
  calendarDateSchema,
  serviceSchema,
  targetSchema,
  userSchema,
} from "../lib/validation";
test("Services default to Sunday and reject other service types", () => {
  const service = { serviceDate: "2026-01-04", serviceName: "Sunday service" };
  assert.equal(serviceSchema.parse(service).serviceType, "SUNDAY_SERVICE");
  assert.equal(
    serviceSchema.safeParse({ ...service, serviceType: "OTHER" }).success,
    false,
  );
});
test("OAuth return URLs cannot leave allowed local routes", () => {
  const origin = "https://church.example";
  for (const path of [
    "https://evil.example/",
    "//evil.example/",
    "/admin/users",
    "javascript:alert(1)",
    "/%2f%2fevil.example/",
  ])
    assert.equal(allowedReturnPath(path, origin), "/");
  assert.equal(
    allowedReturnPath("/?month=2026-01&export=month&format=pptx", origin),
    "/?month=2026-01&export=month&format=pptx",
  );
  assert.equal(allowedReturnPath("/admin/reports", origin), "/admin/reports");
});
test("Google identity requires a matching nonce and verified email", () => {
  const payload = {
    sub: "subject",
    email: "person@example.test",
    email_verified: true,
    nonce: "nonce",
  };
  assert.equal(verifiedGoogleClaims(payload, "nonce").googleSubject, "subject");
  for (const changed of [
    { ...payload, email_verified: false },
    { ...payload, email_verified: "true" },
    { ...payload, nonce: "other" },
    { ...payload, sub: "" },
  ])
    assert.throws(() => verifiedGoogleClaims(changed, "nonce"));
});
test("Dates, target precision and bcrypt byte limits are validated", () => {
  for (const date of ["2026-02-30", "2025-02-29", "2101-01-01"])
    assert.equal(calendarDateSchema.safeParse(date).success, false);
  assert.equal(calendarDateSchema.safeParse("2024-02-29").success, true);
  const target = {
    type: "ATTENDANCE",
    targetValue: 1.5,
    periodType: "MONTHLY",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
  };
  assert.equal(targetSchema.safeParse(target).success, false);
  assert.equal(
    targetSchema.safeParse({ ...target, type: "GIVING", targetValue: 1.123 })
      .success,
    false,
  );
  const user = {
    name: "Staff",
    email: "staff@example.test",
    role: "ENCODER",
    status: "ACTIVE",
  };
  assert.equal(
    userSchema.safeParse({ ...user, password: "a".repeat(72) }).success,
    true,
  );
  assert.equal(
    userSchema.safeParse({ ...user, password: "é".repeat(37) }).success,
    false,
  );
});
