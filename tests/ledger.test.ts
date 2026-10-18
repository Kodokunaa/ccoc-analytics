import { test } from "node:test";
import assert from "node:assert/strict";
import { givingLedger, givingLedgerTotals } from "../prisma/giving-ledger-2026";
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
test("Sunday offerings remain separate from faith pledges and preserve itemized totals", () => {
  assert.equal(new Set(givingLedger.map((r) => r.date)).size, 19);
  for (const row of givingLedger)
    assert.equal(new Date(row.date).getUTCDay(), 0);
  assert.deepEqual(givingLedgerTotals, {
    "2026-06": 9718,
    "2026-07": 15477,
    "2026-08": 15253,
    "2026-09": 10105,
    "2026-10": 3905,
  });
  assert.equal(
    givingLedger.reduce((s, r) => s + r.amount, 0),
    54458,
  );
  assert.equal(
    campaignLedger.reduce((s, r) => s + r.amount, 0),
    61100,
  );
});
