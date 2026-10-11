"use client";
import { useCallback, useEffect, useState } from "react";
import type { Commentary } from "@/lib/manus";
type Task = {
  id: string;
  status: string;
  remoteUrl: string | null;
  output: Commentary | null;
  createdAt: string;
  payload: { approvedSnapshot: boolean };
};
type Data = { configured: boolean; tasks: Task[] };
export default function ManusReportAssistant({
  month,
  admin,
}: {
  month: string;
  admin: boolean;
}) {
  const [data, setData] = useState<Data | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const res = await fetch(`/api/manus-report?month=${month}`, { signal });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    },
    [month],
  );
  useEffect(() => {
    const abort = new AbortController();
    setData(null);
    setError("");
    void load(abort.signal).catch((e) => {
      if (!abort.signal.aborted) setError(e.message);
    });
    return () => abort.abort();
  }, [load]);
  async function action(action: string, id?: string) {
    if (
      action === "create" &&
      !window.confirm(
        `Send public totals for ${month}, last month and the same month last year to Manus for an AI commentary draft? This may consume Manus credits. Private notes and staff details are excluded.`,
      )
    )
      return;
    if (
      action === "release" &&
      !window.confirm(
        "Confirm you checked your Manus account. Releasing this local reservation does not cancel a remote task. Creating another draft could incur duplicate charges.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/manus-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, month, id }),
      });
      const json = await res.json();
      await load();
      if (!res.ok) throw new Error(json.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update commentary.");
    } finally {
      setBusy(false);
    }
  }
  const active = data?.tasks.some((t) =>
    ["CREATING", "RUNNING", "WAITING", "UNKNOWN"].includes(t.status),
  );
  return (
    <section
      className="panel operations-panel"
      aria-label="Monthly AI report assistant"
    >
      <h2>Monthly commentary · {month}</h2>
      <p>
        Draft a monthly summary with attendance, giving, last-month and
        last-year comparisons. Uses public totals only. Staff must review every
        draft; approved reports and PowerPoint exports remain under staff
        control.
      </p>
      {data && !data.configured && (
        <p role="status">
          Manus is not configured. Add MANUS_API_KEY to the server .env file and
          restart the app.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {admin && (
        <button
          className="primary"
          disabled={busy || !data?.configured || active}
          onClick={() => void action("create")}
        >
          Draft with Manus
        </button>
      )}
      {!admin && <p>An administrator can generate and check drafts.</p>}
      {data?.tasks.map((t) => (
        <article className="assistant-draft" key={t.id}>
          <p>
            <strong>{t.status.replaceAll("_", " ")}</strong> ·{" "}
            {new Date(t.createdAt).toLocaleString("en-PH")} ·{" "}
            {t.payload.approvedSnapshot
              ? "Approved snapshot"
              : "Draft data snapshot"}
          </p>
          <p>
            Commentary reflects the totals captured when this request was
            created.
          </p>
          {t.output && (
            <>
              {(
                [
                  ["summary", "Summary"],
                  ["attendance", "Attendance"],
                  ["giving", "Giving"],
                  ["dataQuality", "Data quality"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <h3>{label}</h3>
                  <p className="assistant-copy">{t.output![key]}</p>
                </div>
              ))}
              <small>
                AI-generated draft · Verify numbers and wording before using.
              </small>
            </>
          )}
          {t.status === "UNKNOWN" && (
            <p>
              Creation was not confirmed. Check your Manus account before
              requesting another draft.
            </p>
          )}
          {t.status === "WAITING" && (
            <p>
              Manus needs attention. Open the task in Manus to review its
              request.
            </p>
          )}
          <div className="operation-actions">
            {t.remoteUrl && (
              <a
                className="secondary"
                href={t.remoteUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in Manus
              </a>
            )}
            {admin && ["RUNNING", "WAITING", "CREATING"].includes(t.status) && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void action("refresh", t.id)}
              >
                Check progress
              </button>
            )}
            {admin && t.status === "UNKNOWN" && (
              <>
                <a
                  className="secondary"
                  href="https://manus.im/app"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Check Manus account
                </a>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void action("release", t.id)}
                >
                  Release unconfirmed request
                </button>
              </>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
