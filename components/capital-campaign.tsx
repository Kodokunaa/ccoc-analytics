import { currency } from "@/lib/analytics";

type Entry = {
  id: string;
  year: number;
  month: number | null;
  label: string;
  amount: string;
};
export default function CapitalCampaign({
  entries,
  year,
}: {
  entries: Entry[];
  year: number;
}) {
  const current = entries.filter((e) => e.year === year),
    previous = entries.filter((e) => e.year < year),
    sum = (rows: Entry[]) =>
      rows.reduce((cents, e) => cents + Math.round(Number(e.amount) * 100), 0) /
      100,
    opening = sum(previous),
    collected = sum(current);
  return (
    <section className="capital-campaign" aria-labelledby="campaign-title">
      <div className="section-title">
        <h2 id="campaign-title">Capital campaign · {year}</h2>
      </div>
      <p className="public-data-note">
        Pledges for the church lot, tracked separately from Sunday giving.
        Amounts are transcribed from the supplied ledger.
      </p>
      <div className="kpi-grid">
        {[
          ["Prior-year balance", opening],
          ["Recorded this year", collected],
          ["Calculated balance", opening + collected],
        ].map(([label, value]) => (
          <div className="panel kpi" key={label}>
            <div className="kpi-label">{label}</div>
            <strong className="kpi-value">{currency(Number(value))}</strong>
          </div>
        ))}
      </div>
      {year >= 2026 &&
        entries.some((e) => e.id === "ledger-2026-campaign-01") && (
          <p className="public-notice" role="note">
            Ledger reconciliation pending: the January–October 2026 entries
            total ₱61,100, while the handwritten total is ₱61,150. The ₱50
            difference has not been assigned to a month. The calculated 2026
            balance is ₱80,214; the ledger states ₱80,264.
          </p>
        )}
      <div className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th>Description</th>
                <th>Amount (PHP)</th>
              </tr>
            </thead>
            <tbody>
              {current.map((e) => (
                <tr key={e.id}>
                  <td>
                    {e.month
                      ? new Date(
                          Date.UTC(e.year, e.month - 1),
                        ).toLocaleDateString("en-PH", {
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        })
                      : `${e.year} · undated`}
                  </td>
                  <td>{e.label}</td>
                  <td>{currency(Number(e.amount))}</td>
                </tr>
              ))}
              {!current.length && (
                <tr>
                  <td colSpan={3}>
                    No campaign entries recorded for this year.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {previous.length > 0 && (
        <details className="panel">
          <summary>Prior-year balance details</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Description</th>
                  <th>Amount (PHP)</th>
                </tr>
              </thead>
              <tbody>
                {previous.map((e) => (
                  <tr key={e.id}>
                    <td>{e.year}</td>
                    <td>{e.label}</td>
                    <td>{currency(Number(e.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
