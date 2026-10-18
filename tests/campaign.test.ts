import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignSummary } from "../lib/campaign";
const entries = [
  { id: "opening", year: 2025, month: null, label: "Savings", amount: "19114" },
  { id: "september", year: 2026, month: 9, label: "Pledge", amount: "2100" },
  { id: "october", year: 2026, month: 10, label: "Pledge", amount: "100" },
];
test("campaign summary excludes future pledges and carries prior-year savings", () => {
  assert.deepEqual(campaignSummary(entries, "2026-09"), {
    recorded: true,
    monthly: 2100,
    balance: 21214,
  });
  assert.deepEqual(campaignSummary(entries, "2026-10"), {
    recorded: true,
    monthly: 100,
    balance: 21314,
  });
});
test("missing monthly campaign data is not an invented zero pledge", () => {
  assert.deepEqual(campaignSummary(entries, "2026-08"), {
    recorded: false,
    monthly: 0,
    balance: 19114,
  });
  assert.deepEqual(
    campaignSummary(
      [
        ...entries,
        { id: "zero", year: 2026, month: 8, label: "Pledge", amount: "0" },
      ],
      "2026-08",
    ),
    { recorded: true, monthly: 0, balance: 19114 },
  );
});
