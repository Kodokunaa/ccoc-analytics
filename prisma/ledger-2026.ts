// Transcribed from the two distinct ledger photos supplied on 18 October 2026.
// Repeated attachments are duplicates. Visitor names are intentionally excluded.
export const attendanceLedger = [
  { date: "2026-08-02", total: 43 },
  { date: "2026-08-09", total: 45 },
  { date: "2026-08-16", total: 55 },
  { date: "2026-08-23", total: 58 },
  { date: "2026-08-30", total: 51 },
  { date: "2026-09-06", total: 66, visitors: 3 },
  { date: "2026-09-13", total: 61, visitors: 4 },
  { date: "2026-09-20", total: 49, visitors: 5 },
  { date: "2026-09-27", total: 44 },
];
export const campaignLedger = [
  11600, 10850, 8450, 8400, 6800, 5000, 4500, 3300, 2100, 100,
].map((amount, i) => ({
  id: `ledger-2026-campaign-${String(i + 1).padStart(2, "0")}`,
  year: 2026,
  month: i + 1,
  label: "Faith pledge",
  amount,
  source:
    "Handwritten capital campaign ledger supplied 2026-10-18; monthly figures total 61100, written total 61150; 50 discrepancy unresolved.",
}));
export const campaignCarryForward = [
  {
    id: "ledger-2025-campaign-savings",
    year: 2025,
    month: null,
    label: "2025 savings",
    amount: 17000,
    source:
      "Prior-year savings in supplied campaign ledger; no exact transaction date provided.",
  },
  {
    id: "ledger-2025-campaign-additional",
    year: 2025,
    month: null,
    label: "Additional prior-year savings",
    amount: 2114,
    source:
      "Additional amount included in the handwritten 2025 balance of 19114; no exact transaction date provided.",
  },
];
