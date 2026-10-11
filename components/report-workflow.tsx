"use client";
import { useCallback, useEffect, useState } from "react";
import type { ReportSlide } from "@/lib/presentation-model";
import type { PresentationMetric } from "@/lib/presentation-model";
import { TrendChart } from "./lazy-charts";
import dynamic from "next/dynamic";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import ManusReportAssistant from "./manus-report-assistant";
const MonthProgress = dynamic(() => import("./month-progress"), { ssr: false });
type Workflow = {
  completeness: {
    complete: boolean;
    ended: boolean;
    days: { date: string; future: boolean; issues: string[] }[];
  };
  approval: { approvedAt: string | null; approvedBy: string | null } | null;
  archives: { id: string; serviceDate: string; serviceName: string }[];
  artifacts: {
    id: string;
    filename: string;
    checksum: string;
    approved: boolean;
    createdAt: string;
  }[];
};
export default function ReportWorkflow({
  month,
  admin,
  onChange,
}: {
  month: string;
  admin: boolean;
  onChange: () => Promise<void>;
}) {
  const reducedMotion = useReducedMotion();
  const [data, setData] = useState<Workflow | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<{
      slides: ReportSlide[];
      churchName: string;
      approved: boolean;
      report: PresentationMetric;
    } | null>(null),
    [page, setPage] = useState(0);
  const load = useCallback(async () => {
    const res = await fetch(`/api/report-workflow?month=${month}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    setData(json);
  }, [month]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    setPreview(null);
  }, [load]);
  async function action(action: string, id?: string) {
    if (
      !window.confirm(
        action === "approve"
          ? "Approve this month and lock its records?"
          : action === "reopen"
            ? "Reopen this month for corrections? Existing archived exports remain available."
            : "Restore this archived Sunday service?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/report-workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, month, id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await load();
      await onChange();
      setPreview(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update report");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel operations-panel">
        <h2>Monthly review · {month}</h2>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {data && (
          <>
            <p>
              {data.approval?.approvedAt
                ? `Approved by ${data.approval.approvedBy} · ${new Date(data.approval.approvedAt).toLocaleString("en-PH")} · Locked`
                : "Draft · Records can be edited"}
            </p>
            {!data.completeness.ended && (
              <p>This month has not finished yet.</p>
            )}
            <div className="table-wrap">
              <MonthProgress
                complete={
                  data.completeness.days.filter((d) => !d.issues.length).length
                }
                total={data.completeness.days.length}
              />
              <details open={!data.completeness.complete}>
                <summary>
                  {data.completeness.complete
                    ? "Sunday checklist"
                    : "Missing Sunday data"}
                </summary>
                <table>
                  <thead>
                    <tr>
                      <th>Sunday</th>
                      <th>Data status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.completeness.days
                      .filter(
                        (d) => data.completeness.complete || d.issues.length,
                      )
                      .map((d) => (
                        <tr key={d.date}>
                          <td>{d.date}</td>
                          <td>
                            {d.issues.length
                              ? `${d.future ? "Upcoming · " : ""}${d.issues.join("; ")}`
                              : "Complete"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </details>
            </div>
            <div className="operation-actions">
              {admin &&
                (data.approval?.approvedAt ? (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void action("reopen")}
                  >
                    Reopen month
                  </button>
                ) : (
                  <button
                    className="primary"
                    disabled={
                      busy ||
                      !data.completeness.complete ||
                      !data.completeness.ended
                    }
                    onClick={() => void action("approve")}
                  >
                    Approve and lock month
                  </button>
                ))}
              {(["attendance", "giving"] as const).map((report) => (
                <button
                  key={report}
                  className="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const res = await fetch(
                        `/api/report-preview?month=${month}&report=${report}`,
                      );
                      const json = await res.json();
                      if (!res.ok) throw new Error(json.error);
                      setPreview(json);
                      setPage(0);
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Unable to preview",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Preview {report} PowerPoint
                </button>
              ))}
            </div>
          </>
        )}
      </section>
      {preview && (
        <section
          className="panel operations-panel"
          aria-label="PowerPoint content preview"
        >
          <div className="operation-actions">
            <h2>
              {preview.report === "attendance" ? "Attendance" : "Giving"}{" "}
              PowerPoint preview
            </h2>
            <button className="secondary" onClick={() => setPreview(null)}>
              Close preview
            </button>
          </div>
          <p>
            Slide content preview ·{" "}
            {preview.approved ? "Approved snapshot" : "Current draft"}.
            PowerPoint uses the same numbers, chart values, and comparisons.
          </p>
          <LazyMotion features={domAnimation}>
            <m.div
              key={page}
              className="slide-preview"
              initial={reducedMotion ? false : { y: 8 }}
              animate={{ y: 0 }}
              transition={{ duration: 0.2 }}
            >
              <h2>{preview.slides[page].title}</h2>
              <p>{preview.slides[page].period}</p>
              {preview.slides[page].rows && (
                <div className="table-wrap">
                  <table>
                    <colgroup>
                      {(preview.slides[page].widths ?? [8, 4]).map(
                        (width, i, widths) => (
                          <col
                            key={i}
                            style={{
                              width: `${(width / widths.reduce((sum, w) => sum + w, 0)) * 100}%`,
                            }}
                          />
                        ),
                      )}
                    </colgroup>
                    <thead>
                      <tr>
                        {preview.slides[page].rows![0].map((c, i) => (
                          <th key={i}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slides[page].rows!.slice(1).map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {preview.slides[page].chart && (
                <TrendChart
                  data={preview.slides[page].chart!.labels.map((name, i) => ({
                    name,
                    attendance:
                      preview.slides[page].chart!.metric === "attendance"
                        ? preview.slides[page].chart!.values[i]
                        : 0,
                    giving:
                      preview.slides[page].chart!.metric === "giving"
                        ? preview.slides[page].chart!.values[i]
                        : 0,
                  }))}
                  mode={
                    preview.slides[page].chart!.metric === "attendance"
                      ? "attendance"
                      : "financial"
                  }
                  comparison={false}
                />
              )}
              {preview.slides[page].empty && (
                <p>{preview.slides[page].empty}</p>
              )}
              {preview.slides[page].caption && (
                <p>{preview.slides[page].caption}</p>
              )}
              <small>
                {preview.churchName} · {page + 1}
              </small>
            </m.div>
          </LazyMotion>
          <div className="operation-actions">
            <button
              className="secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous slide
            </button>
            <span>
              {page + 1} / {preview.slides.length}
            </span>
            <button
              className="secondary"
              disabled={page === preview.slides.length - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next slide
            </button>
          </div>
        </section>
      )}
      <details className="disclosure-panel">
        <summary>AI commentary</summary>
        <ManusReportAssistant key={month} month={month} admin={admin} />
      </details>
      {Boolean(data?.artifacts.length) && (
        <details className="panel operations-panel disclosure-panel">
          <summary>Saved reports ({data?.artifacts.length ?? 0})</summary>
          <p>
            The latest 100 saved public and staff exports, including draft and
            approved versions. Downloading requires Google sign-in.
          </p>
          {!data?.artifacts.length ? (
            <p>No archived exports for this month.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Saved</th>
                    <th>Status</th>
                    <th>Download</th>
                  </tr>
                </thead>
                <tbody>
                  {data.artifacts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.filename}
                        <details>
                          <summary>SHA-256 checksum</summary>
                          <code className="checksum">{a.checksum}</code>
                        </details>
                      </td>
                      <td>{new Date(a.createdAt).toLocaleString("en-PH")}</td>
                      <td>{a.approved ? "Approved snapshot" : "Draft"}</td>
                      <td>
                        <button
                          className="secondary"
                          onClick={async () => {
                            setError("");
                            try {
                              const res = await fetch(
                                `/api/report-archive/${a.id}`,
                              );
                              if (res.status === 401) {
                                window.location.assign(
                                  "/signin?next=%2Fadmin%2Freports",
                                );
                                return;
                              }
                              if (!res.ok)
                                throw new Error((await res.json()).error);
                              const url = URL.createObjectURL(await res.blob());
                              const link = document.createElement("a");
                              link.href = url;
                              link.download = a.filename;
                              link.click();
                              setTimeout(() => URL.revokeObjectURL(url), 1000);
                            } catch (e) {
                              setError(
                                e instanceof Error
                                  ? e.message
                                  : "Unable to download",
                              );
                            }
                          }}
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      )}
      {admin && Boolean(data?.archives.length) && (
        <details className="panel operations-panel disclosure-panel">
          <summary>
            Restore archived services ({data?.archives.length ?? 0})
          </summary>
          <p>
            Restores attendance and giving along with the service. Approved
            months and duplicate Sunday dates remain protected.
          </p>
          {!data?.archives.length ? (
            <p>No archived services.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Service</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.archives.map((s) => (
                    <tr key={s.id}>
                      <td>{s.serviceDate.slice(0, 10)}</td>
                      <td>{s.serviceName}</td>
                      <td>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => void action("restore", s.id)}
                        >
                          Restore service
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      )}
    </>
  );
}
