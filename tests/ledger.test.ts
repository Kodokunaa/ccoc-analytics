import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attendanceLedger,
  campaignLedger,
  campaignCarryForward,
} from "../prisma/ledger-2026";
test("supplied attendance is deduplicated, Sunday-only, and reconciles by month", () => {
  assert.equal(new Set(attendanceLedger.map((r) => r.date)).size, 9);
  for (const row of attendanceLedger)
    assert.equal(new Date(row.date).getUTCDay(), 0);
  assert.equal(
    attendanceLedger
      .filter((r) => r.date.startsWith("2026-08"))
      .reduce((s, r) => s + r.total, 0),
    252,
  );
  assert.equal(
    attendanceLedger
      .filter((r) => r.date.startsWith("2026-09"))
      .reduce((s, r) => s + r.total, 0),
    220,
  );
  assert.deepEqual(
    attendanceLedger
      .filter((r) => r.visitors !== undefined)
      .map((r) => r.visitors),
    [3, 4, 5],
  );
});
test("campaign uses itemized amounts without inventing a balancing transaction", () => {
  assert.equal(
    campaignLedger.reduce((s, r) => s + r.amount, 0),
    61100,
  );
  assert.equal(
    campaignCarryForward.reduce((s, r) => s + r.amount, 0),
    19114,
  );
  assert.equal(campaignLedger.length, 10);
  assert.ok(campaignCarryForward.every((r) => r.month === null));
});
