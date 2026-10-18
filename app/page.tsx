import Transparency from "@/components/transparency";
import { db } from "@/lib/db";
import { getTransparency } from "@/lib/transparency";
import { currentGoogleViewer, googleConfigured } from "@/lib/google";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    year?: string;
    export?: string;
    format?: string;
    report?: string;
  }>;
}) {
  const q = await searchParams,
    latest = await db.service.findFirst({
      where: { deletedAt: null },
      select: { serviceDate: true },
      orderBy: { serviceDate: "desc" },
    });
  const latestMonth =
    latest?.serviceDate.toISOString().slice(0, 7) ??
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      timeZone: "Asia/Manila",
    }).format(new Date());
  const selected =
    q.month &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month) &&
    Number(q.month.slice(0, 4)) >= 1990 &&
    Number(q.month.slice(0, 4)) <= 2100
      ? q.month
      : latestMonth;
  const year =
    q.year &&
    /^\d{4}$/.test(q.year) &&
    Number(q.year) >= 1990 &&
    Number(q.year) <= 2100
      ? Number(q.year)
      : Number(selected.slice(0, 4));
  const exportScope =
    q.export === "data" || q.export === "year" || q.export === "month"
      ? q.export
      : undefined;
  const [data, viewer] = await Promise.all([
    getTransparency(year),
    currentGoogleViewer(),
  ]);
  return (
    <Transparency
      initialData={data}
      initialMonth={`${year}-${selected.slice(5)}`}
      initialViewer={viewer}
      googleReady={googleConfigured()}
      initialScope={exportScope ?? "month"}
      initialFormat={q.format === "pptx" ? "pptx" : "xlsx"}
      initialReport={
        q.report === "both"
          ? "both"
          : q.report === "giving"
            ? "giving"
            : "attendance"
      }
      initialExportOpen={!!exportScope}
    />
  );
}
