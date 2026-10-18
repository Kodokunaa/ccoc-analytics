"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import { useDashboardEntrance } from "./use-dashboard-entrance";
import Link from "next/link";
import {
  Download,
  Users,
  Wallet,
  CalendarDays,
  HeartHandshake,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  LoaderCircle,
  LogOut,
  LockKeyhole,
  FileSpreadsheet,
} from "lucide-react";
import { TrendChart } from "./lazy-charts";
import GoogleMark from "./google-mark";
import ChurchLogo from "./church-logo";
import CapitalCampaign from "./capital-campaign";
import type { TransparencyData } from "@/lib/transparency";
import { monthReport, monthName } from "@/lib/public-analytics";
import { currency, series, growth } from "@/lib/analytics";
type Viewer = { id: string; name: string; email: string } | null;
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
const percent = (value: number | null) =>
  value === null
    ? "No baseline"
    : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
export default function Transparency({
  initialData,
  initialMonth,
  initialViewer,
  googleReady,
  initialScope = "month",
  initialExportOpen = false,
  initialFormat = "xlsx",
  initialReport = "attendance",
}: {
  initialData: TransparencyData;
  initialMonth: string;
  initialViewer: Viewer;
  googleReady: boolean;
  initialScope?: "data" | "month" | "year";
  initialExportOpen?: boolean;
  initialFormat?: "xlsx" | "pptx";
  initialReport?: "attendance" | "giving";
}) {
  const [data, setData] = useState(initialData),
    [month, setMonth] = useState(initialMonth),
    [year, setYear] = useState(Number(initialMonth.slice(0, 4))),
    [viewer, setViewer] = useState(initialViewer),
    [tab, setTab] = useState("overview"),
    [loading, setLoading] = useState(false),
    [downloading, setDownloading] = useState(false),
    [notice, setNotice] = useState(""),
    [exportOpen, setExportOpen] = useState(initialExportOpen),
    [scope, setScope] = useState<"data" | "month" | "year">(
      initialFormat === "pptx" && initialScope === "data"
        ? "month"
        : initialScope,
    ),
    [format, setFormat] = useState<"xlsx" | "pptx">(initialFormat),
    [reportType, setReportType] = useState<"attendance" | "giving">(
      initialReport,
    ),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const modalRef = useRef<HTMLElement>(null),
    sequence = useRef(0);
  const entranceRoot = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  useDashboardEntrance(entranceRoot, `${tab}:${month}`);
  useEffect(() => {
    if (!exportOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const buttons = () =>
      Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),select,a[href]",
        ) ?? [],
      );
    buttons()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExportOpen(false);
      if (e.key === "Tab") {
        const items = buttons();
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [exportOpen]);
  async function filters(nextYear: number) {
    const id = ++sequence.current;
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch(`/api/transparency?year=${nextYear}`),
        result = await res.json();
      if (!res.ok) throw new Error(result.error);
      if (id !== sequence.current) return;
      setData(result);
      setYear(nextYear);
      setMonth(`${nextYear}-${month.slice(5)}`);
      setPage(1);
    } catch (error) {
      if (id === sequence.current)
        setNotice(
          error instanceof Error ? error.message : "Unable to load reports",
        );
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }
  const report = useMemo(
      () => monthReport(data.records, month),
      [data.records, month],
    ),
    stats = report.stats,
    rows = report.records.filter((s) =>
      s.serviceName.toLowerCase().includes(search.toLowerCase()),
    ),
    pages = Math.max(1, Math.ceil(rows.length / 10)),
    currentPage = Math.min(page, pages);
  const currentPath = `/?month=${month}&year=${year}`;
  async function download() {
    if (!viewer) return;
    setDownloading(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/transparency/export?scope=${scope}&year=${year}&month=${month}&format=${format}&report=${reportType}`,
      );
      if (!response.ok) {
        const body = await response.json();
        if (response.status === 401) setViewer(null);
        throw new Error(body.error);
      }
      const url = URL.createObjectURL(await response.blob()),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `city-church-${format === "pptx" ? `${reportType}-` : ""}${scope === "year" ? `${year}-monthly-reports` : `${month}-${scope}`}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
      setNotice(
        `Your ${format === "pptx" ? "PowerPoint" : "Excel"} report is ready.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to download report",
      );
    } finally {
      setDownloading(false);
    }
  }
  const metric = (
    name: string,
    value: string,
    change: number | null,
    Icon: typeof Users,
  ) => (
    <div className="panel kpi">
      <div className="kpi-label">
        {name}
        <span className="kpi-icon">
          <Icon size={18} />
        </span>
      </div>
      <strong>{value}</strong>
      <div className="kpi-footer">
        <span
          className={`trend ${change === null || change === 0 ? "neutral" : change > 0 ? "positive" : "negative"}`}
        >
          {change !== null && change < 0 ? (
            <ArrowDownRight size={13} />
          ) : (
            <ArrowUpRight size={13} />
          )}{" "}
          {percent(change)}
        </span>
        <span>vs. previous month</span>
      </div>
    </div>
  );
  const recordsTable = (
    <section className="panel table-panel">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {["Service", "Date", "Attendance", "Giving (PHP)"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice((currentPage - 1) * 10, currentPage * 10).map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.serviceName}</strong>
                </td>
                <td>{date(s.serviceDate)}</td>
                <td>{s.attendance?.totalAttendance ?? "Not recorded"}</td>
                <td>
                  {currency(
                    s.giving.reduce((sum, g) => sum + Number(g.amount), 0),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <div className="empty">
            <CalendarDays size={26} />
            <h3>No services recorded</h3>
            <p>There are no matching records for this month.</p>
          </div>
        )}
      </div>
      <div className="pagination">
        <span>
          {rows.length} services · Page {currentPage} of {pages}
        </span>
        <div>
          <button
            aria-label="Previous page"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            aria-label="Next page"
            disabled={currentPage >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </section>
  );
  return (
    <div className="transparency-site">
      <header className="public-header">
        <div className="public-header-inner">
          <Link href="/" className="brand">
            <ChurchLogo size={40} />
            <span>
              {data.churchName === "City Church of Christ" ? (
                <>
                  City Church<span className="brand-second">of Christ</span>
                </>
              ) : (
                data.churchName
              )}
            </span>
          </Link>
          <span className="public-badge">
            <ShieldCheck size={14} />
            Transparency portal
          </span>
          <div className="public-account">
            {viewer ? (
              <>
                <span className="public-viewer">
                  <span className="avatar">{viewer.name[0]}</span>
                  {viewer.name}
                </span>
                <button
                  className="icon-button"
                  aria-label="Sign out of Google account"
                  onClick={async () => {
                    try {
                      const r = await fetch("/api/google/session", {
                        method: "DELETE",
                      });
                      if (!r.ok) throw new Error("Unable to sign out");
                      setViewer(null);
                    } catch (e) {
                      setNotice(
                        e instanceof Error ? e.message : "Unable to sign out",
                      );
                    }
                  }}
                >
                  <LogOut size={16} />
                </button>
              </>
            ) : (
              <Link
                href={`/signin?next=${encodeURIComponent(currentPath)}`}
                className="google-button compact"
              >
                <GoogleMark />
                Google sign-in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="public-content" ref={entranceRoot}>
        <div className="public-title-row">
          <div>
            <span className="eyebrow">OPEN RECORDS · SHARED STEWARDSHIP</span>
            <h1>Our church, in the open.</h1>
            <p>
              Attendance, giving, and progress. Available for everyone to
              explore.
            </p>
          </div>
          {tab !== "campaign" && (
            <div className="public-export-actions">
              <button
                className="primary"
                onClick={() => {
                  setScope(
                    tab === "monthly"
                      ? "year"
                      : tab === "records"
                        ? "data"
                        : "month",
                  );
                  setExportOpen(true);
                }}
              >
                <Download size={16} />
                Export report
              </button>
            </div>
          )}
        </div>
        <LazyMotion features={domAnimation}>
          <nav className="public-tabs" aria-label="Transparency views">
            {[
              ["overview", "Overview"],
              ["monthly", "Monthly reports"],
              ["records", "Service records"],
              ["campaign", "Capital campaign"],
            ].map(([key, title]) => (
              <button
                aria-current={tab === key ? "page" : undefined}
                className={tab === key ? "active" : ""}
                onClick={() => setTab(key)}
                key={key}
              >
                {tab === key && (
                  <m.span
                    className="tab-indicator"
                    initial={false}
                    animate={{ opacity: 1 }}
                    transition={{ duration: reducedMotion ? 0 : 0.2 }}
                    aria-hidden="true"
                  />
                )}
                <span className="tab-label">{title}</span>
              </button>
            ))}
          </nav>
        </LazyMotion>
        {notice && (
          <div className="public-notice" role="status">
            {notice}
            <button
              className="icon-button"
              aria-label="Dismiss message"
              onClick={() => setNotice("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="filter-bar public-filters">
          <label>
            Year
            <select
              aria-label="Year"
              value={year}
              disabled={loading}
              onChange={(e) => void filters(Number(e.target.value))}
            >
              {data.years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          {tab !== "monthly" && tab !== "campaign" && (
            <label>
              Month
              <select
                aria-label="Month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setPage(1);
                }}
              >
                {data.months.map((m) => (
                  <option value={m.month} key={m.month}>
                    {m.title.split(" ")[0]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tab === "overview" && (
            <div className="public-compare">
              <CalendarDays size={17} />
              <div>
                <span>Compared with</span>
                <strong>{monthName(report.previousMonth)}</strong>
              </div>
            </div>
          )}
        </div>
        {loading ? (
          <div className="skeleton" aria-label="Loading reports" />
        ) : (
          <>
            <div className="section-caption">
              <span>
                <span className="live-dot" />
                {tab === "campaign"
                  ? `${year} CAPITAL CAMPAIGN`
                  : tab === "monthly"
                    ? `${year} MONTHLY REPORTS`
                    : report.title.toUpperCase()}
              </span>
              {tab !== "monthly" && tab !== "campaign" && (
                <span>{report.services} services recorded</span>
              )}
            </div>
            {tab === "campaign" && (
              <CapitalCampaign entries={data.campaign} year={year} />
            )}
            {tab === "overview" && (
              <>
                <div className="kpi-grid">
                  {metric(
                    "Total attendance",
                    stats.totalAttendance.toLocaleString(),
                    report.attendanceGrowth,
                    Users,
                  )}
                  {metric(
                    "Total giving",
                    currency(stats.totalGiving),
                    report.givingGrowth,
                    Wallet,
                  )}
                  {metric(
                    "Average weekly attendance",
                    stats.averageWeeklyAttendance.toFixed(2),
                    report.records.some((r) => r.attendance !== null) &&
                      report.previousRecords.some((r) => r.attendance !== null)
                      ? growth(
                          stats.averageWeeklyAttendance,
                          report.previousStats.averageWeeklyAttendance,
                        )
                      : null,
                    CalendarDays,
                  )}
                  {metric(
                    "Giving per attendee",
                    currency(stats.givingPerAttendee),
                    stats.totalAttendance > 0 &&
                      report.previousStats.totalAttendance > 0 &&
                      report.records.some((r) => r.giving.length > 0) &&
                      report.previousRecords.some((r) => r.giving.length > 0)
                      ? growth(
                          stats.givingPerAttendee,
                          report.previousStats.givingPerAttendee,
                        )
                      : null,
                    HeartHandshake,
                  )}
                </div>
                <div className="dashboard-charts separate-trends">
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Attendance trend</h2>
                        <p>Service records grouped by week</p>
                      </div>
                      <span className="badge">{report.title}</span>
                    </div>
                    <TrendChart
                      data={series(
                        report.records.filter((s) => s.attendance !== null),
                      )}
                      mode="attendance"
                      comparison={false}
                    />
                    <div className="chart-note">Attendance grouped by week</div>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Giving trend</h2>
                        <p>Recorded giving grouped by week</p>
                      </div>
                      <span className="badge">{report.title}</span>
                    </div>
                    <TrendChart
                      data={series(
                        report.records.filter((s) => s.giving.length > 0),
                      )}
                      mode="financial"
                      comparison={false}
                    />
                    <div className="chart-note">
                      Giving in Philippine Peso (PHP)
                    </div>
                  </section>
                </div>
                <details className="panel public-comparison disclosure-panel">
                  <summary>Compare with last month</summary>
                  <div className="panel-heading">
                    <div>
                      <h2>This month & last month</h2>
                      <p>
                        {report.title} compared with{" "}
                        {monthName(report.previousMonth)}
                      </p>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>{monthName(report.previousMonth)}</th>
                          <th>{report.title}</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Total attendance</td>
                          <td>
                            {report.previousServices
                              ? report.previousStats.totalAttendance.toLocaleString()
                              : "No records"}
                          </td>
                          <td>{stats.totalAttendance.toLocaleString()}</td>
                          <td>{percent(report.attendanceGrowth)}</td>
                        </tr>
                        <tr>
                          <td>Total giving</td>
                          <td>
                            {report.previousServices
                              ? currency(report.previousStats.totalGiving)
                              : "No records"}
                          </td>
                          <td>{currency(stats.totalGiving)}</td>
                          <td>{percent(report.givingGrowth)}</td>
                        </tr>
                        <tr>
                          <td>Services recorded</td>
                          <td>{report.previousServices}</td>
                          <td>{report.services}</td>
                          <td>—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="public-data-note">
                    Figures reflect recorded services. No baseline means the
                    previous month has no records or a zero total.
                  </p>
                </details>
              </>
            )}
            {tab === "monthly" && (
              <>
                <div className="section-title">
                  <div>
                    <h2>A report for every month</h2>
                    <p className="public-subtitle">
                      Each report includes a comparison with the previous month.
                    </p>
                  </div>
                </div>
                <section className="panel table-panel">
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {[
                            "Month",
                            "Services",
                            "Attendance",
                            "Giving",
                            "Attendance change",
                            "Giving change",
                          ].map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.months.map((r) => (
                          <tr key={r.month}>
                            <td>
                              <button
                                className="text-button"
                                onClick={() => {
                                  setMonth(r.month);
                                  setTab("overview");
                                }}
                              >
                                {r.title}
                              </button>
                              {!r.services && (
                                <small className="table-sub">
                                  No services recorded
                                </small>
                              )}
                            </td>
                            <td>{r.services}</td>
                            <td>{r.stats.totalAttendance.toLocaleString()}</td>
                            <td>{currency(r.stats.totalGiving)}</td>
                            <td>{percent(r.attendanceGrowth)}</td>
                            <td>{percent(r.givingGrowth)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <p className="public-data-note">
                  The yearly workbook contains an annual summary and a separate
                  report sheet for each of the 12 months, including months with
                  no records.
                </p>
              </>
            )}
            {tab === "records" && (
              <>
                <div className="section-title">
                  <h2>Service records · {report.title}</h2>
                </div>
                <div className="table-tools">
                  <div className="search-box">
                    <Search size={16} />
                    <input
                      aria-label="Search services"
                      value={search}
                      placeholder="Search services…"
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                </div>
                {recordsTable}
              </>
            )}
          </>
        )}
        <footer className="public-footer">
          <div>
            <strong>{data.churchName}</strong>
            <p>{data.churchAddress || "Open records. Faithful stewardship."}</p>
          </div>
          <span>
            Philippine Peso (PHP) · Asia/Manila
            <br />
            Viewing is open to everyone. Google sign-in is required for
            downloads.
          </span>
        </footer>
      </main>
      {exportOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !downloading)
              setExportOpen(false);
          }}
        >
          <section
            ref={modalRef}
            className="panel modal public-export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">TRANSPARENCY / EXPORT</span>
                <h2 id="export-title">Take the report with you.</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close export"
                disabled={downloading}
                onClick={() => setExportOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="public-export-body">
              <label>
                File format
                <select
                  aria-label="File format"
                  value={format}
                  onChange={(e) => {
                    setFormat(e.target.value as typeof format);
                    if (e.target.value === "pptx") setScope("month");
                  }}
                >
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="pptx">Monthly PowerPoint (.pptx)</option>
                </select>
              </label>
              {format === "pptx" && (
                <label>
                  Report type
                  <select
                    aria-label="Report type"
                    value={reportType}
                    onChange={(e) =>
                      setReportType(e.target.value as typeof reportType)
                    }
                  >
                    <option value="attendance">Attendance</option>
                    <option value="giving">Giving</option>
                  </select>
                </label>
              )}
              <label>
                Export contents
                <select
                  aria-label="Export contents"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as typeof scope)}
                >
                  <option value="month">Monthly report · {report.title}</option>
                  <option value="year">Reports for every month · {year}</option>
                  {format === "xlsx" && (
                    <option value="data">
                      Attendance & giving data · {report.title}
                    </option>
                  )}
                </select>
              </label>
              <div className="export-description">
                <FileSpreadsheet size={26} />
                <div>
                  <strong>
                    {format === "pptx"
                      ? "One set of data per slide."
                      : scope === "year"
                        ? "13 sheets. A whole year of insight."
                        : "Summary, attendance, and giving."}
                  </strong>
                  <p>
                    {format === "pptx"
                      ? `${reportType === "attendance" ? "Attendance" : "Giving"} numbers, graph, and comparisons with last month and last year. Three slides per month.`
                      : scope === "year"
                        ? "An annual summary plus January–December reports, with previous-month comparisons."
                        : "Includes recorded service data and a summary compared with the previous month."}
                  </p>
                </div>
              </div>
              {viewer ? (
                <>
                  <p className="signin-note">
                    Signed in with Google as {viewer.email}
                  </p>
                  <button
                    className="primary"
                    disabled={downloading}
                    onClick={() => void download()}
                  >
                    {downloading ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Download size={17} />
                    )}
                    {format === "pptx"
                      ? "Download PowerPoint"
                      : "Download XLSX"}
                  </button>
                </>
              ) : (
                <>
                  <div className="export-signin-note">
                    <LockKeyhole size={17} />
                    <p>
                      Sign in with Google to download. You can continue viewing
                      all reports without an account.
                    </p>
                  </div>
                  <Link
                    className="google-button"
                    href={`/signin?next=${encodeURIComponent(`${currentPath}&export=${scope}&format=${format}&report=${reportType}`)}`}
                  >
                    <GoogleMark />
                    Continue with Google
                  </Link>
                  {!googleReady && (
                    <p className="signin-note">
                      Google sign-in is being set up. Downloads will be
                      available once it’s connected.
                    </p>
                  )}
                </>
              )}
              <small>
                Only public attendance and giving data is included. Private
                notes and staff information are excluded.
              </small>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
