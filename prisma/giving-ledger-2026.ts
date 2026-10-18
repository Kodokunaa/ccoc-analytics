// Sunday offerings sheet supplied on 18 October 2026. Kept separate from
// capital campaign faith pledges. June itemized amounts total 9718; the
// handwritten subtotal is 9724. Do not invent a balancing transaction.
export const givingLedger = [
  { date: "2026-06-07", amount: 2590 },
  { date: "2026-06-14", amount: 2180 },
  { date: "2026-06-21", amount: 2684 },
  { date: "2026-06-28", amount: 2264 },
  { date: "2026-07-05", amount: 5270 },
  { date: "2026-07-12", amount: 2727 },
  { date: "2026-07-19", amount: 4310 },
  { date: "2026-07-26", amount: 3170 },
  { date: "2026-08-02", amount: 1696 },
  { date: "2026-08-09", amount: 5587 },
  { date: "2026-08-16", amount: 2445 },
  { date: "2026-08-23", amount: 3310 },
  { date: "2026-08-30", amount: 2215 },
  { date: "2026-09-06", amount: 3325 },
  { date: "2026-09-13", amount: 2820 },
  { date: "2026-09-20", amount: 1700 },
  { date: "2026-09-27", amount: 2260 },
  { date: "2026-10-04", amount: 1840 },
  { date: "2026-10-11", amount: 2065 },
];
export const givingLedgerTotals = Object.fromEntries(
  ["06", "07", "08", "09", "10"].map((month) => [
    `2026-${month}`,
    givingLedger
      .filter((r) => r.date.startsWith(`2026-${month}`))
      .reduce((sum, r) => sum + r.amount, 0),
  ]),
);
