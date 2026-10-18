import Link from "next/link";
import { currency } from "@/lib/analytics";
import { campaignSummary, type CampaignEntry } from "@/lib/campaign";
import { monthName } from "@/lib/public-analytics";

export default function CampaignSummary({
  entries,
  month,
  onView,
}: {
  entries: CampaignEntry[];
  month: string;
  onView?: () => void;
}) {
  const totals = campaignSummary(entries, month);
  return (
    <section className="panel campaign-summary">
      <div className="panel-heading">
        <div>
          <h2>Capital campaign</h2>
          <p>Faith pledges · {monthName(month)}</p>
        </div>
      </div>
      <div className="campaign-summary-values">
        <div>
          <span>Monthly pledges</span>
          <strong>
            {totals.recorded ? currency(totals.monthly) : "Not recorded"}
          </strong>
        </div>
        <div>
          <span>Campaign balance through {monthName(month)}</span>
          <strong>{currency(totals.balance)}</strong>
        </div>
        <p>
          Includes prior-year savings. Campaign funds are tracked separately
          from Sunday giving.
        </p>
      </div>
      <div className="chart-note">
        {onView ? (
          <button className="text-button" onClick={onView}>
            View campaign records
          </button>
        ) : (
          <Link href="/admin/capital-campaign" className="text-button">
            View campaign records
          </Link>
        )}
      </div>
    </section>
  );
}
