export type CampaignEntry = {
  id: string;
  year: number;
  month: number | null;
  label: string;
  amount: string;
};

export function campaignSummary(entries: CampaignEntry[], month: string) {
  const year = Number(month.slice(0, 4)),
    selectedMonth = Number(month.slice(5, 7));
  const sum = (rows: CampaignEntry[]) =>
    rows.reduce((cents, e) => cents + Math.round(Number(e.amount) * 100), 0) /
    100;
  const current = entries.filter(
    (e) => e.year === year && e.month === selectedMonth,
  );
  return {
    recorded: current.length > 0,
    monthly: sum(current),
    balance: sum(
      entries.filter(
        (e) =>
          e.year < year ||
          (e.year === year && (e.month === null || e.month <= selectedMonth)),
      ),
    ),
  };
}
