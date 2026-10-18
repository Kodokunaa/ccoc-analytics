"use client";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { comparisonWindow, periodWindow } from "@/lib/periods";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Wallet,
  ChartNoAxesCombined,
  FileText,
  ShieldCheck,
  Settings,
  LogOut,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Search,
  Download,
  SlidersHorizontal,
  LoaderCircle,
  Check,
  HeartHandshake,
} from "lucide-react";
import { TrendChart, Breakdown } from "./lazy-charts";
import ChurchLogo from "./church-logo";
import CapitalCampaign from "./capital-campaign";
import CampaignSummary from "./campaign-summary";
import type { CampaignEntry } from "@/lib/campaign";
import ReportWorkflow from "./report-workflow";
import ServiceImport from "./service-import";
import {
  currency,
  growth,
  summary,
  series,
  comparisonSeries,
  type RecordData,
} from "@/lib/analytics";
import {
  serviceSchema,
  attendanceSchema,
  givingSchema,
  userSchema,
  targetSchema,
  settingsSchema,
} from "@/lib/validation";
type Service = Omit<RecordData, "giving" | "attendance"> & {
  attendance:
    | (NonNullable<RecordData["attendance"]> & {
        id: string;
        creator: { name: string };
      })
    | null;
  notes: string | null;
  createdBy: string;
  creator: { name: string };
  giving: (RecordData["giving"][number] & {
    id: string;
    notes: string | null;
    creator: { name: string };
  })[];
};
type TargetData = {
  id: string;
  type: string;
  periodType: string;
  targetValue: string;
  startDate: string;
  endDate: string;
};
type UserData = {
  id: string;
  name: string;
  email: string;
  status: string;
  role: { name: string };
  createdAt: string;
};
type Log = {
  id: string;
  createdAt: string;
  user: { name: string };
  action: string;
  entity: string;
  entityId: string;
  oldData: unknown;
  newData: unknown;
  ipAddress: string | null;
};
type Data = {
  campaign: CampaignEntry[];
  user: { id: string; name: string; email: string; role: string };
  services: Service[];
  targets: TargetData[];
  settings: Record<string, string>;
  users: UserData[];
  logs: Log[];
  mailConfigured?: boolean;
};
type Fields = Record<string, string | number | boolean>;
type Modal = { entity: string; id?: string; values: Fields; view?: boolean };
const nav: { label: string; items: [string, string, LucideIcon][] }[] = [
  { label: "Overview", items: [["Dashboard", "dashboard", LayoutDashboard]] },
  {
    label: "Church records",
    items: [
      ["Services", "services", CalendarDays],
      ["Attendance", "attendance", Users],
      ["Giving", "giving", Wallet],
      ["Capital campaign", "capital-campaign", HeartHandshake],
    ],
  },
  {
    label: "Insights & planning",
    items: [
      ["Attendance analytics", "analytics/attendance", ChartNoAxesCombined],
      ["Giving analytics", "analytics/financial", ChartNoAxesCombined],
      ["Reports", "reports", FileText],
    ],
  },
  {
    label: "Administration",
    items: [
      ["Users", "users", Users],
      ["Audit logs", "audit-logs", ShieldCheck],
      ["Settings", "settings", Settings],
    ],
  },
];
const label = (s: string) =>
  s
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
const day = (s: string) =>
  new Date(s).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  });
const pct = (v: number | null) =>
  v === null ? "No baseline" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const attendanceValues = (a: Service["attendance"]): Fields => ({
  totalAttendance: a?.totalAttendance ?? 0,
  adultCount: a?.adultCount ?? 0,
  childrenCount: a?.childrenCount ?? 0,
  memberCount: a?.memberCount ?? 0,
  visitorCount: a?.visitorCount ?? 0,
});
export default function Workspace({ section }: { section: string }) {
  const router = useRouter();
  const initialized = useRef(false);
  const dialog = useRef<HTMLElement>(null);
  const [data, setData] = useState<Data | null>(null),
    [loadError, setLoadError] = useState(""),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<Modal | null>(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const [start, setStart] = useState("2026-01-01"),
    [end, setEnd] = useState("2026-01-31"),
    [comparison, setComparison] = useState("year"),
    [customStart, setCustomStart] = useState("2025-01-01"),
    [customEnd, setCustomEnd] = useState("2025-01-31"),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1);
  const modalOpen = Boolean(modal);
  useEffect(() => {
    if (!modalOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const getFocusable = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]",
        ) ?? [],
      );
    getFocusable()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(null);
        return;
      }
      if (e.key !== "Tab") return;
      const list = getFocusable(),
        first = list[0],
        last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previouslyFocused?.focus();
    };
  }, [modalOpen]);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/data?section=${encodeURIComponent(section)}`,
        { cache: "no-store" },
      );
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 401) router.push("/admin/login");
        throw new Error(d.error);
      }
      setData(d);
      if (!initialized.current) {
        initialized.current = true;
        const window = periodWindow(
          d.services[0]?.serviceDate.slice(0, 10) ?? today(),
          "MONTHLY",
        );
        setStart(window.start);
        setEnd(window.end);
      }
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Unable to load data");
    }
  }, [router, section]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const filtered = useMemo(
    () =>
      data?.services.filter(
        (s) =>
          s.serviceDate.slice(0, 10) >= start &&
          s.serviceDate.slice(0, 10) <= end,
      ) ?? [],
    [data, start, end],
  );
  const previous = useMemo(() => {
    const { start: from, end: to } = comparisonWindow(
      start,
      end,
      comparison,
      customStart,
      customEnd,
    );
    return (
      data?.services.filter(
        (s) =>
          s.serviceDate.slice(0, 10) >= from &&
          s.serviceDate.slice(0, 10) <= to,
      ) ?? []
    );
  }, [data, start, end, comparison, customStart, customEnd]);
  const stats = useMemo(() => summary(filtered), [filtered]),
    prior = useMemo(() => summary(previous), [previous]),
    attendanceWeekly = useMemo(
      () => series(filtered.filter((s) => s.attendance !== null)),
      [filtered],
    ),
    givingWeekly = useMemo(
      () => series(filtered.filter((s) => s.giving.length > 0)),
      [filtered],
    );
  const hasAttendanceComparison =
      filtered.some((s) => s.attendance !== null) &&
      previous.some((s) => s.attendance !== null),
    hasGivingComparison =
      filtered.some((s) => s.giving.length > 0) &&
      previous.some((s) => s.giving.length > 0),
    attendanceGrowth = hasAttendanceComparison
      ? growth(stats.totalAttendance, prior.totalAttendance)
      : null,
    givingGrowth = hasGivingComparison
      ? growth(stats.totalGiving, prior.totalGiving)
      : null;
  const compareSeries = (monthlyMode = false) => {
    const recorded = (s: RecordData) =>
      section.endsWith("attendance")
        ? s.attendance !== null
        : s.giving.length > 0;
    return comparisonSeries(
      filtered.filter(recorded),
      previous.filter(recorded),
      start,
      comparisonWindow(start, end, comparison, customStart, customEnd).start,
      monthlyMode ? "monthly" : "weekly",
    );
  };
  const isAdmin = data?.user.role === "SUPER_ADMIN",
    canWrite = data?.user.role !== "VIEWER";
  const title =
    nav.flatMap((g) => g.items).find((i) => i[1] === section)?.[0] ??
    (section.startsWith("analytics/")
      ? "Analytics"
      : section === "targets"
        ? "Targets"
        : "Dashboard");
  const notify = (s: string) => setToast(s);
  const open = (
    entity: string,
    values: Fields = {},
    id?: string,
    view = false,
  ) => {
    setFormError("");
    setModal({ entity, id, view, values: { ...values } });
  };
  const mutate = async (
    entity: string,
    values: unknown,
    id?: string,
    remove = false,
  ) => {
    const r = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, data: values, id, remove }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    await refresh();
  };
  const remove = async (entity: string, id: string) => {
    if (
      !window.confirm(
        entity === "service"
          ? "Archive this service? It will be removed from analytics while its history is preserved."
          : "Delete this target?",
      )
    )
      return;
    try {
      await mutate(entity, undefined, id, true);
      notify("Record removed successfully");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Unable to remove record");
    }
  };
  const exportReport = async (format: string) => {
    try {
      setBusy(true);
      const response = await fetch(
        `/api/reports?format=${format}&start=${start}&end=${end}&comparison=${comparison}&customStart=${customStart}&customEnd=${customEnd}&period=MONTHLY`,
      );
      if (!response.ok) {
        if (response.status === 401) {
          router.push("/signin?next=%2Fadmin%2Freports");
          return;
        }
        const d = await response.json();
        throw new Error(d.error);
      }
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `city-church-report-${start}.${format === "excel" ? "xlsx" : "pdf"}`;
      a.click();
      URL.revokeObjectURL(url);
      notify("Report exported successfully");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Unable to export");
    } finally {
      setBusy(false);
    }
  };
  const editService = (s: Service, view = false) =>
    open(
      "service",
      {
        serviceDate: s.serviceDate.slice(0, 10),
        serviceType: "SUNDAY_SERVICE",
        serviceName: s.serviceName,
        notes: s.notes ?? "",
        includeAttendance: !!s.attendance,
        ...attendanceValues(s.attendance),
      },
      s.id,
      view,
    );
  const action = (
    entity: string,
    id: string,
    values: Fields,
    editable = true,
  ) => (
    <div className="row-actions">
      {editable && canWrite && (
        <button
          className="text-button"
          onClick={() => open(entity, values, id)}
        >
          Edit
        </button>
      )}
      {isAdmin && ["service", "target"].includes(entity) && (
        <button
          className="text-button danger"
          onClick={() => void remove(entity, id)}
        >
          Remove
        </button>
      )}
    </div>
  );
  function field(
    name: string,
    text: string,
    type = "text",
    options?: { value: string; label: string }[],
  ) {
    if (!modal) return null;
    return (
      <label>
        {text}
        {options ? (
          <select
            aria-label={text}
            name={name}
            value={String(modal.values[name] ?? "")}
            disabled={modal.view}
            onChange={(e) =>
              setModal({
                ...modal,
                values: { ...modal.values, [name]: e.target.value },
              })
            }
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : type === "checkbox" ? (
          <input
            type="checkbox"
            checked={Boolean(modal.values[name])}
            disabled={modal.view}
            onChange={(e) =>
              setModal({
                ...modal,
                values: { ...modal.values, [name]: e.target.checked },
              })
            }
          />
        ) : (
          <input
            type={type}
            name={name}
            value={String(modal.values[name] ?? "")}
            disabled={modal.view}
            min={type === "number" ? 0 : undefined}
            step={type === "number" ? "any" : undefined}
            onChange={(e) =>
              setModal({
                ...modal,
                values: { ...modal.values, [name]: e.target.value },
              })
            }
          />
        )}
      </label>
    );
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!modal) return;
    setBusy(true);
    setFormError("");
    try {
      const v = modal.values;
      let parsed: unknown = v;
      const att = {
        totalAttendance: Number(v.totalAttendance ?? 0),
        adultCount: Number(v.adultCount ?? 0),
        childrenCount: Number(v.childrenCount ?? 0),
        memberCount: Number(v.memberCount ?? 0),
        visitorCount: Number(v.visitorCount ?? 0),
      };
      if (modal.entity === "service")
        parsed = serviceSchema.parse({
          ...v,
          ...(v.includeAttendance ? { attendance: att } : {}),
          ...(v.includeGiving
            ? {
                giving: [
                  {
                    amount: v.amount,
                    notes: v.givingNotes ?? "",
                  },
                ],
              }
            : {}),
        });
      if (modal.entity === "attendance")
        parsed = { ...attendanceSchema.parse(att), serviceId: v.serviceId };
      if (modal.entity === "giving")
        parsed = { ...givingSchema.parse(v), serviceId: v.serviceId };
      if (modal.entity === "target") parsed = targetSchema.parse(v);
      if (modal.entity === "user")
        parsed = userSchema.parse({ ...v, password: v.password || undefined });
      if (modal.entity === "settings") parsed = settingsSchema.parse(v);
      await mutate(modal.entity, parsed, modal.id);
      setModal(null);
      notify(
        modal.id ? "Record updated successfully" : "Record saved successfully",
      );
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Unable to save record");
    } finally {
      setBusy(false);
    }
  }
  const attendanceFields = (
    <>
      {field("totalAttendance", "Total attendance", "number")}
      {field("adultCount", "Adults", "number")}
      {field("childrenCount", "Children", "number")}
      {field("memberCount", "Members", "number")}
      {field("visitorCount", "Visitors", "number")}
    </>
  );
  const options = (values: readonly string[]) =>
    values.map((value) => ({ value, label: label(value) }));
  const serviceOptions =
    data?.services
      .filter((s) => isAdmin || s.createdBy === data.user.id)
      .map((s) => ({
        value: s.id,
        label: `${day(s.serviceDate)} · ${s.serviceName}`,
      })) ?? [];
  const givingFields = (
    <>
      {field("amount", "Amount (PHP)", "number")}
      {field(
        modal?.entity === "service" ? "givingNotes" : "notes",
        "Giving notes",
      )}
    </>
  );
  const table = (headers: string[], rows: React.ReactNode[][]) => {
    const total = Math.ceil(rows.length / 10),
      safePage = Math.min(page, Math.max(1, total));
    return (
      <div className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice((safePage - 1) * 10, safePage * 10).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div className="empty">
              <CalendarDays />
              <h3>No records for this view</h3>
              <p>Adjust your filters or add your first record.</p>
            </div>
          )}
        </div>
        <div className="pagination">
          <span>
            {rows.length} records · Page {safePage} of {Math.max(1, total)}
          </span>
          <div>
            <button
              aria-label="Previous page"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              aria-label="Next page"
              disabled={safePage >= total}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>
    );
  };
  const matched = filtered.filter((s) =>
    `${s.serviceName} ${s.creator.name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const breakdown = (kind: string) => {
    const sums = new Map<string, number>();
    for (const s of filtered) {
      if (kind === "service")
        sums.set(
          s.serviceName,
          (sums.get(s.serviceName) ?? 0) + (s.attendance?.totalAttendance ?? 0),
        );
      else {
        const a = s.attendance;
        if (a)
          for (const [key, name] of kind === "members"
            ? ([
                ["memberCount", "Members"],
                ["visitorCount", "Visitors"],
              ] as const)
            : ([
                ["adultCount", "Adults"],
                ["childrenCount", "Children"],
              ] as const))
            sums.set(name, (sums.get(name) ?? 0) + a[key]);
      }
    }
    if (kind === "members" || kind === "ages") {
      const unclassified = filtered.reduce((sum, s) => {
        const a = s.attendance;
        return (
          sum +
          (a
            ? a.totalAttendance -
              (kind === "members"
                ? a.memberCount + a.visitorCount
                : a.adultCount + a.childrenCount)
            : 0)
        );
      }, 0);
      if (unclassified > 0) sums.set("Unclassified", unclassified);
    }
    return [...sums].map(([name, value]) => ({ name, value }));
  };
  const kpi = (
    name: string,
    value: string,
    change: number | null,
    icon: React.ReactNode,
    description: string,
  ) => (
    <div className="kpi panel">
      <div className="kpi-label">
        {name}
        <span className="kpi-icon">{icon}</span>
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
          {pct(change)}
        </span>
        <span>{description}</span>
      </div>
    </div>
  );
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
        <Link href="/admin/dashboard" className="brand">
          <span className="brand-icon">
            {data?.settings.logo ? (
              <img
                src={data.settings.logo}
                alt="Church logo"
                width={44}
                height={44}
                style={{ borderRadius: 12, objectFit: "contain" }}
              />
            ) : (
              <ChurchLogo size={36} />
            )}
          </span>
          <span>
            {!data?.settings.churchName ||
            data.settings.churchName === "City Church of Christ" ? (
              <>
                City Church<span className="brand-second">of Christ</span>
              </>
            ) : (
              data.settings.churchName
            )}
          </span>
        </Link>
        <span className="workspace-tag">CHURCH ANALYTICS</span>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        >
          <X />
        </button>
        <nav>
          {nav.map((group) => (
            <div className="nav-group" key={group.label}>
              {group.label === "Administration" && !isAdmin ? null : (
                <>
                  <div className="nav-label">{group.label}</div>
                  {group.items.map(([name, path, Icon]) => (
                    <Link
                      href={`/admin/${path}`}
                      key={path}
                      className={`nav-item ${section === path || (path === "analytics/attendance" && section.startsWith("analytics/")) ? "active" : ""}`}
                      onClick={() => setMobile(false)}
                    >
                      <Icon size={18} />
                      <span>{name}</span>
                      {section === path && <span className="active-dot" />}
                    </Link>
                  ))}
                </>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="stewardship">
            <span className="little-icon">
              <HeartHandshake size={18} />
            </span>
            <strong>Growing together</strong>
            <p>Faithful in the little things.</p>
          </div>
          <button
            className="logout"
            onClick={async () => {
              try {
                const r = await fetch("/api/auth", { method: "DELETE" });
                if (!r.ok) throw new Error("Unable to sign out");
                router.push("/admin/login");
              } catch (e) {
                notify(e instanceof Error ? e.message : "Unable to sign out");
              }
            }}
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          aria-label="Close navigation overlay"
          className="overlay"
          onClick={() => setMobile(false)}
        />
      )}
      <div
        className={`workspace ${section === "dashboard" ? "dashboard-workspace" : ""}`}
      >
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle icon-button"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-right">
            <span className="top-date">
              <CalendarDays size={15} />
              {day(today())}
            </span>
            <span className="top-divider" />
            <details className="profile-menu">
              <summary>
                <span className="avatar">
                  {data?.user.name
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("") ?? "CC"}
                </span>
                <span>
                  <strong>{data?.user.name ?? "Loading…"}</strong>
                  <small>{label(data?.user.role ?? "")}</small>
                </span>
              </summary>
              <div>
                <strong>{data?.user.name}</strong>
                <small>{data?.user.email}</small>
                <span>{label(data?.user.role ?? "")}</span>
              </div>
            </details>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {data?.settings.churchName ?? "City Church of Christ"}
              </div>
              <h1>{section === "dashboard" ? "Church overview" : title}</h1>
              <p>
                {section === "dashboard"
                  ? "A clearer picture of our community, growth, and generosity."
                  : section === "services"
                    ? "Keep every gathering and its story in one place."
                    : "Thoughtful insight for faithful stewardship."}
              </p>
            </div>
            <div className="heading-actions">
              {section === "dashboard" && (
                <Link className="secondary" href="/admin/reports">
                  Monthly reports
                </Link>
              )}
              {canWrite &&
                ["dashboard", "services", "attendance", "giving"].includes(
                  section,
                ) && (
                  <button
                    className="primary"
                    onClick={() =>
                      open(
                        section === "dashboard" || section === "services"
                          ? "service"
                          : section,
                        {
                          serviceDate: (() => {
                            const d = new Date(`${today()}T00:00:00Z`);
                            d.setUTCDate(d.getUTCDate() - d.getUTCDay());
                            return d.toISOString().slice(0, 10);
                          })(),
                          serviceName: "Sunday service",
                        },
                      )
                    }
                  >
                    <Plus size={17} />{" "}
                    {section === "dashboard" || section === "services"
                      ? "Add service"
                      : `Add ${section}`}
                  </button>
                )}
            </div>
          </div>
          {loadError ? (
            <div className="panel empty" role="alert">
              <h3>Unable to load your workspace</h3>
              <p>{loadError}</p>
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          ) : !data ? (
            <div className="skeleton" />
          ) : (
            <>
              {![
                "users",
                "audit-logs",
                "settings",
                "targets",
                "capital-campaign",
              ].includes(section) && (
                <div className="filter-bar">
                  <div className="filter-heading">
                    <SlidersHorizontal size={16} />
                    <span>Filters</span>
                  </div>
                  <label>
                    Month
                    <select
                      aria-label="Month"
                      value={start.slice(5, 7)}
                      onChange={(e) => {
                        const range = periodWindow(
                          `${start.slice(0, 4)}-${e.target.value}-01`,
                          "MONTHLY",
                        );
                        setStart(range.start);
                        setEnd(range.end);
                        setPage(1);
                      }}
                    >
                      {Array.from({ length: 12 }, (_, i) => {
                        const value = String(i + 1).padStart(2, "0");
                        return (
                          <option value={value} key={value}>
                            {new Date(`2026-${value}-01`).toLocaleDateString(
                              "en-PH",
                              { month: "long", timeZone: "Asia/Manila" },
                            )}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label>
                    Year
                    <select
                      aria-label="Year"
                      value={start.slice(0, 4)}
                      onChange={(e) => {
                        const range = periodWindow(
                          `${e.target.value}-${start.slice(5, 7)}-01`,
                          "MONTHLY",
                        );
                        setStart(range.start);
                        setEnd(range.end);
                        setPage(1);
                      }}
                    >
                      {Array.from(
                        new Set([
                          today().slice(0, 4),
                          start.slice(0, 4),
                          ...data.services.map((s) =>
                            s.serviceDate.slice(0, 4),
                          ),
                        ]),
                      )
                        .sort()
                        .reverse()
                        .map((year) => (
                          <option key={year}>{year}</option>
                        ))}
                    </select>
                  </label>
                  {section !== "reports" && (
                    <>
                      <details className="range-filter">
                        <summary>Custom dates</summary>
                        <div className="operation-actions">
                          <label>
                            From
                            <input
                              type="date"
                              value={start}
                              onChange={(e) => {
                                if (e.target.value) setStart(e.target.value);
                                setPage(1);
                              }}
                            />
                          </label>
                          <label>
                            To
                            <input
                              type="date"
                              value={end}
                              min={start}
                              onChange={(e) => {
                                if (e.target.value) setEnd(e.target.value);
                                setPage(1);
                              }}
                            />
                          </label>
                        </div>
                      </details>
                      <label>
                        Compare with
                        <select
                          aria-label="Compare with"
                          value={comparison}
                          onChange={(e) => setComparison(e.target.value)}
                        >
                          <option value="year">Same period last year</option>
                          <option value="month">Previous month</option>
                          <option value="custom">Custom period</option>
                        </select>
                      </label>
                      {comparison === "custom" && (
                        <>
                          <label>
                            Comparison from
                            <input
                              type="date"
                              value={customStart}
                              onChange={(e) => setCustomStart(e.target.value)}
                            />
                          </label>
                          <label>
                            Comparison to
                            <input
                              type="date"
                              value={customEnd}
                              min={customStart}
                              onChange={(e) => setCustomEnd(e.target.value)}
                            />
                          </label>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
              {section === "dashboard" && (
                <>
                  <div className="section-caption">
                    <span>
                      <span className="live-dot" /> PERIOD SNAPSHOT
                    </span>
                    <span>
                      {day(start)} – {day(end)}
                      <span className="badge">{filtered.length} services</span>
                    </span>
                  </div>
                  <div className="kpi-grid">
                    {kpi(
                      "Total attendance",
                      filtered.some((r) => r.attendance !== null)
                        ? stats.totalAttendance.toLocaleString()
                        : "Not recorded",
                      attendanceGrowth,
                      <Users size={19} />,
                      "vs. comparison",
                    )}
                    {kpi(
                      "Total giving",
                      filtered.some((r) => r.giving.length > 0)
                        ? currency(stats.totalGiving)
                        : "Not recorded",
                      givingGrowth,
                      <Wallet size={19} />,
                      "vs. comparison",
                    )}
                    {kpi(
                      "Avg. weekly attendance",
                      filtered.some((r) => r.attendance !== null)
                        ? stats.averageWeeklyAttendance.toFixed(2)
                        : "Not recorded",
                      hasAttendanceComparison
                        ? growth(
                            stats.averageWeeklyAttendance,
                            prior.averageWeeklyAttendance,
                          )
                        : null,
                      <CalendarDays size={19} />,
                      "vs. comparison",
                    )}
                    {kpi(
                      "Giving per attendee",
                      stats.givingPerAttendeeAvailable
                        ? currency(stats.givingPerAttendee)
                        : "Not available",
                      stats.givingPerAttendeeAvailable &&
                        prior.givingPerAttendeeAvailable
                        ? growth(
                            stats.givingPerAttendee,
                            prior.givingPerAttendee,
                          )
                        : null,
                      <HeartHandshake size={19} />,
                      "vs. comparison",
                    )}
                  </div>
                  <div className="dashboard-charts separate-trends with-campaign">
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Attendance trend</h2>
                          <p>How our community shows up, week by week</p>
                        </div>
                        <span className="badge">Weekly</span>
                      </div>
                      <TrendChart
                        data={attendanceWeekly}
                        mode="attendance"
                        comparison={false}
                      />
                      <div className="chart-note">
                        Attendance grouped by week
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Giving trend</h2>
                          <p>Recorded giving grouped by week</p>
                        </div>
                        <span className="badge">Weekly</span>
                      </div>
                      <TrendChart
                        data={givingWeekly}
                        mode="financial"
                        comparison={false}
                      />
                      <div className="chart-note">
                        Giving in Philippine Peso (PHP)
                      </div>
                    </section>
                    <CampaignSummary
                      entries={data.campaign}
                      month={end.slice(0, 7)}
                    />
                  </div>
                </>
              )}
              {section === "capital-campaign" && (
                <>
                  <div className="filter-bar">
                    <label>
                      Year
                      <select
                        aria-label="Campaign year"
                        value={start.slice(0, 4)}
                        onChange={(e) => {
                          const range = periodWindow(
                            `${e.target.value}-01-01`,
                            "YEARLY",
                          );
                          setStart(range.start);
                          setEnd(range.end);
                        }}
                      >
                        {Array.from(
                          new Set([
                            Number(start.slice(0, 4)),
                            ...data.campaign.map((e) => e.year),
                          ]),
                        )
                          .sort((a, b) => b - a)
                          .map((year) => (
                            <option key={year}>{year}</option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <CapitalCampaign
                    entries={data.campaign}
                    year={Number(start.slice(0, 4))}
                  />
                </>
              )}
              {section.startsWith("analytics/") && (
                <>
                  <div className="analytics-grid">
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>
                          Weekly{" "}
                          {section.endsWith("attendance")
                            ? "attendance"
                            : "giving"}
                        </h2>
                      </div>
                      <TrendChart
                        data={compareSeries()}
                        mode={
                          section.endsWith("attendance")
                            ? "attendance"
                            : "financial"
                        }
                      />
                    </section>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Monthly trend & period comparison</h2>
                      </div>
                      <TrendChart
                        data={compareSeries(true)}
                        monthly
                        mode={
                          section.endsWith("attendance")
                            ? "attendance"
                            : "financial"
                        }
                      />
                    </section>
                    {section.endsWith("attendance") && (
                      <>
                        <section className="panel">
                          <div className="panel-heading">
                            <h2>Members & visitors</h2>
                          </div>
                          <Breakdown data={breakdown("members")} />
                        </section>
                        <section className="panel">
                          <div className="panel-heading">
                            <h2>Adults & children</h2>
                          </div>
                          <Breakdown data={breakdown("ages")} />
                        </section>
                      </>
                    )}
                  </div>
                </>
              )}
              {[
                "services",
                "attendance",
                "giving",
                "users",
                "audit-logs",
              ].includes(section) && (
                <div className="table-tools">
                  <div className="search-box">
                    <Search size={16} />
                    <input
                      aria-label="Search records"
                      placeholder="Search records…"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  {section === "users" && isAdmin && (
                    <button
                      className="primary"
                      onClick={() => open("user", { status: "ACTIVE" })}
                    >
                      <Plus size={16} />
                      Add user
                    </button>
                  )}
                </div>
              )}
              {section === "services" &&
                table(
                  [
                    "Service",
                    "Date",
                    "Attendance",
                    "Giving",
                    "Created by",
                    "Actions",
                  ],
                  matched.map((s) => [
                    <button
                      key="name"
                      className="text-button"
                      onClick={() => editService(s, true)}
                    >
                      {s.serviceName}
                    </button>,
                    day(s.serviceDate),
                    s.attendance?.totalAttendance ?? "—",
                    currency(
                      s.giving.reduce((n, g) => n + Number(g.amount), 0),
                    ),
                    s.creator.name,
                    <div key="actions" className="row-actions">
                      {canWrite &&
                        (isAdmin || s.createdBy === data.user.id) && (
                          <button
                            onClick={() => editService(s)}
                            className="text-button"
                          >
                            Edit
                          </button>
                        )}
                      {isAdmin && (
                        <button
                          className="text-button danger"
                          onClick={() => void remove("service", s.id)}
                        >
                          Archive
                        </button>
                      )}
                    </div>,
                  ]),
                )}
              {section === "attendance" &&
                table(
                  [
                    "Date",
                    "Service",
                    "Total",
                    "Adults",
                    "Children",
                    "Members",
                    "Visitors",
                    "Created by",
                    "Actions",
                  ],
                  matched
                    .filter((s) => s.attendance)
                    .map((s) => [
                      day(s.serviceDate),
                      s.serviceName,
                      s.attendance!.totalAttendance,
                      s.attendance!.adultCount,
                      s.attendance!.childrenCount,
                      s.attendance!.memberCount,
                      s.attendance!.visitorCount,
                      s.attendance!.creator.name,
                      action(
                        "attendance",
                        s.attendance!.id,
                        { ...attendanceValues(s.attendance), serviceId: s.id },
                        isAdmin || s.createdBy === data.user.id,
                      ),
                    ]),
                )}
              {section === "giving" &&
                table(
                  [
                    "Date",
                    "Service",
                    "Amount",
                    "Notes",
                    "Created by",
                    "Actions",
                  ],
                  matched.flatMap((s) =>
                    s.giving.map((g) => [
                      day(s.serviceDate),
                      s.serviceName,
                      currency(Number(g.amount)),
                      g.notes ?? "—",
                      g.creator.name,
                      action(
                        "giving",
                        g.id,
                        {
                          serviceId: s.id,
                          amount: Number(g.amount),
                          notes: g.notes ?? "",
                        },
                        isAdmin || s.createdBy === data.user.id,
                      ),
                    ]),
                  ),
                )}
              {section === "targets" && (
                <>
                  <div className="section-title">
                    <h2>Goals for our church</h2>
                    {isAdmin && (
                      <button
                        className="primary"
                        onClick={() =>
                          open("target", {
                            type: "ATTENDANCE",
                            periodType: "MONTHLY",
                            startDate: start,
                            endDate: end,
                          })
                        }
                      >
                        <Plus size={16} />
                        Add target
                      </button>
                    )}
                  </div>
                  {table(
                    [
                      "Target",
                      "Period",
                      "Date range",
                      "Actual",
                      "Goal",
                      "Achievement",
                      "Actions",
                    ],
                    data.targets.map((t) => {
                      const a = summary(
                          data.services.filter(
                            (s) =>
                              s.serviceDate >= t.startDate &&
                              s.serviceDate <= t.endDate,
                          ),
                        ),
                        actual =
                          t.type === "GIVING"
                            ? a.totalGiving
                            : a.totalAttendance;
                      return [
                        label(t.type),
                        label(t.periodType),
                        `${day(t.startDate)} – ${day(t.endDate)}`,
                        t.type === "GIVING" ? currency(actual) : actual,
                        t.type === "GIVING"
                          ? currency(Number(t.targetValue))
                          : t.targetValue,
                        `${((actual / Number(t.targetValue)) * 100).toFixed(1)}%`,
                        isAdmin
                          ? action("target", t.id, {
                              type: t.type,
                              periodType: t.periodType,
                              targetValue: t.targetValue,
                              startDate: t.startDate.slice(0, 10),
                              endDate: t.endDate.slice(0, 10),
                            })
                          : "—",
                      ];
                    }),
                  )}
                </>
              )}
              {section === "users" &&
                table(
                  ["Name", "Email", "Role", "Status", "Created", "Actions"],
                  data.users
                    .filter((u) =>
                      `${u.name} ${u.email}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((u) => [
                      u.name,
                      u.email,
                      <span className="badge" key="role">
                        {label(u.role.name)}
                      </span>,
                      <span className="badge green" key="status">
                        {label(u.status)}
                      </span>,
                      day(u.createdAt),
                      action("user", u.id, {
                        name: u.name,
                        email: u.email,
                        role: u.role.name,
                        status: u.status,
                      }),
                    ]),
                )}
              {section === "audit-logs" && (
                <>
                  <p className="muted">
                    Latest 500 events. All audit history is retained in
                    PostgreSQL.
                  </p>
                  {table(
                    [
                      "Date",
                      "User",
                      "Action",
                      "Entity",
                      "Record ID",
                      "Old value",
                      "New value",
                      "IP",
                    ],
                    data.logs
                      .filter((l) =>
                        `${l.user.name} ${l.action} ${l.entity}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((l) => [
                        new Date(l.createdAt).toLocaleString("en-PH", {
                          timeZone: "Asia/Manila",
                        }),
                        l.user.name,
                        <span className="badge" key="action">
                          {l.action}
                        </span>,
                        l.entity,
                        <span className="record-id" key="id">
                          {l.entityId}
                        </span>,
                        <details key="old">
                          <summary>Inspect</summary>
                          <pre>{JSON.stringify(l.oldData, null, 2)}</pre>
                        </details>,
                        <details key="new">
                          <summary>Inspect</summary>
                          <pre>{JSON.stringify(l.newData, null, 2)}</pre>
                        </details>,
                        l.ipAddress ?? "—",
                      ]),
                  )}
                </>
              )}
              {section === "reports" && (
                <>
                  <section className="panel report-actions">
                    <div>
                      <h2>Monthly exports</h2>
                      <p>
                        Select a month above. Google sign-in is required to
                        download.
                      </p>
                    </div>
                    <div>
                      {(["attendance", "giving"] as const).map((report) => (
                        <section className="report-export-group" key={report}>
                          <h3>
                            {report === "attendance" ? "Attendance" : "Giving"}
                          </h3>
                          <Link
                            className="primary"
                            href={`/?year=${start.slice(0, 4)}&month=${start.slice(0, 7)}&export=month&format=pptx&report=${report}`}
                          >
                            <Download size={16} />
                            {report === "attendance"
                              ? "Attendance"
                              : "Giving"}{" "}
                            PowerPoint (.pptx)
                          </Link>
                        </section>
                      ))}
                      <Link
                        className="secondary"
                        href={`/?year=${start.slice(0, 4)}&month=${start.slice(0, 7)}&export=month&format=xlsx`}
                      >
                        <Download size={16} />
                        Monthly Excel (.xlsx)
                      </Link>
                    </div>
                  </section>
                  <ReportWorkflow
                    key={start.slice(0, 7)}
                    month={start.slice(0, 7)}
                    admin={isAdmin}
                    onChange={refresh}
                  />
                  {isAdmin && (
                    <details className="disclosure-panel">
                      <summary>Import Sunday records</summary>
                      <ServiceImport onChange={refresh} />
                    </details>
                  )}
                  <details className="disclosure-panel">
                    <summary>Other export formats</summary>
                    <div className="operation-actions">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void exportReport("pdf")}
                      >
                        Download PDF summary
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void exportReport("excel")}
                      >
                        Download detailed Excel
                      </button>
                    </div>
                  </details>
                </>
              )}
              {section === "settings" && (
                <>
                  <section className="panel operations-panel">
                    <h2>Staff password recovery</h2>
                    <p>
                      {data.mailConfigured
                        ? "Email reset delivery is configured. Staff can request one-use, 30-minute reset links from the staff login page."
                        : "Email delivery is pending configuration. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and MAIL_FROM to the local .env file, then restart the app."}
                    </p>
                  </section>
                  <div className="panel settings-summary">
                    <div>
                      <h2>Church profile</h2>
                      <p>
                        {data.settings.churchName ?? "City Church of Christ"}
                      </p>
                      <p>{data.settings.churchAddress || "No address set"}</p>
                      <p>Philippine Peso (PHP) · Asia/Manila</p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() =>
                        open("settings", {
                          churchName: "City Church of Christ",
                          churchAddress: "",
                          currency: "PHP",
                          timezone: "Asia/Manila",
                          logo: "",
                          defaultServiceType: "SUNDAY_SERVICE",
                          ...data.settings,
                        })
                      }
                    >
                      Edit settings
                    </button>
                  </div>
                </>
              )}
              <footer className="page-footer">
                <span>
                  {data.settings.churchName ?? "City Church of Christ"}
                </span>
                <span>
                  Made for faithful stewardship{" "}
                  <span className="footer-dot">·</span> Asia/Manila
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <section
            ref={dialog}
            className="modal panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="panel-heading">
              <div>
                <span className="eyebrow">CHURCH RECORDS</span>
                <h2 id="modal-title">
                  {modal.view ? "View" : modal.id ? "Edit" : "Add"}{" "}
                  {label(modal.entity)}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close dialog"
                disabled={busy}
                onClick={() => setModal(null)}
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={save}>
              <div className="form-grid">
                {modal.entity === "service" && (
                  <>
                    {field("serviceDate", "Service date", "date")}
                    {field("serviceName", "Service name")}
                    {field("notes", "Notes")}
                    {field(
                      "includeAttendance",
                      "Include attendance",
                      "checkbox",
                    )}
                    {modal.values.includeAttendance && attendanceFields}
                    {!modal.view && (
                      <>
                        {field(
                          "includeGiving",
                          modal.id
                            ? "Add an additional giving record"
                            : "Include giving",
                          "checkbox",
                        )}
                        {modal.values.includeGiving && givingFields}
                      </>
                    )}
                  </>
                )}
                {["attendance", "giving"].includes(modal.entity) && (
                  <>
                    {field("serviceId", "Service", "text", [
                      { value: "", label: "Choose a service" },
                      ...serviceOptions,
                    ])}
                    {modal.entity === "attendance"
                      ? attendanceFields
                      : givingFields}
                  </>
                )}
                {modal.entity === "target" && (
                  <>
                    {field(
                      "type",
                      "Target type",
                      "text",
                      options(["ATTENDANCE", "GIVING"]),
                    )}
                    {field(
                      "periodType",
                      "Period",
                      "text",
                      options(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
                    )}
                    {field("targetValue", "Target value", "number")}
                    {field("startDate", "Start date", "date")}
                    {field("endDate", "End date", "date")}
                  </>
                )}
                {modal.entity === "user" && (
                  <>
                    {field("name", "Full name")}
                    {field("email", "Email address", "email")}
                    <p>
                      {modal.id && modal.values.role === "SUPER_ADMIN"
                        ? "Administrator account · Role is retained."
                        : "Staff role: Encoder · Assigned automatically."}
                    </p>
                    {field(
                      "status",
                      "Status",
                      "text",
                      options(["ACTIVE", "INACTIVE"]),
                    )}
                    {field(
                      "password",
                      modal.id
                        ? "New password (leave blank to keep current)"
                        : "Password (at least 12 characters)",
                      "password",
                    )}
                  </>
                )}
                {modal.entity === "settings" && (
                  <>
                    {field("churchName", "Church name")}
                    {field("churchAddress", "Address")}
                    {field("currency", "Currency", "text", [
                      { value: "PHP", label: "Philippine Peso (PHP)" },
                    ])}
                    {field("timezone", "Timezone", "text", [
                      { value: "Asia/Manila", label: "Asia/Manila" },
                    ])}
                    {field("logo", "Logo URL (HTTPS)")}
                  </>
                )}
              </div>
              {formError && (
                <p role="alert" className="error">
                  {formError}
                </p>
              )}
              <div className="modal-footer">
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  {modal.view ? "Close" : "Cancel"}
                </button>
                {!modal.view && (
                  <button type="submit" className="primary" disabled={busy}>
                    {busy ? (
                      <LoaderCircle className="spin" size={17} />
                    ) : (
                      <Check size={17} />
                    )}
                    Save record
                  </button>
                )}
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
