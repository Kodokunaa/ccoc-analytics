import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGoogleViewer } from "@/lib/google";
import { getTransparency, publicQuerySchema } from "@/lib/transparency";
import { db } from "@/lib/db";
import { auditContext } from "@/lib/audit";
import { reserveExport } from "@/lib/rate-limit";
import { reportSource } from "@/lib/report-source";
import type { TransparencyData } from "@/lib/transparency";
import { createHash } from "node:crypto";
export async function GET(req: NextRequest) {
  try {
    const viewer = await requireGoogleViewer();
    const q = publicQuerySchema
      .extend({
        scope: z.enum(["data", "month", "year"]),
        format: z.enum(["xlsx", "pptx"]).default("xlsx"),
        report: z.enum(["attendance", "giving", "both"]).default("attendance"),
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      })
      .refine(
        (q) => q.month.startsWith(String(q.year)),
        "Month must match year",
      )
      .refine(
        (q) => q.format !== "pptx" || q.scope !== "data",
        "PowerPoint requires a monthly or yearly report",
      )
      .parse(Object.fromEntries(req.nextUrl.searchParams));
    if (!(await reserveExport(viewer.id)))
      return NextResponse.json(
        { error: "Please wait a minute before downloading another report." },
        {
          status: 429,
          headers: { "Retry-After": "60", "Cache-Control": "no-store" },
        },
      );
    const source =
      q.scope !== "year"
        ? await reportSource(q.month)
        : {
            data: await getTransparency(q.year),
            previousYear: await getTransparency(q.year - 1),
            approved: false,
          };
    const data = source.data;
    const approvals =
      q.scope === "year"
        ? await db.reportMonth.findMany({
            where: {
              month: { startsWith: `${q.year}-` },
              approvedAt: { not: null },
            },
            select: { month: true, snapshot: true },
          })
        : [];
    const sources = Object.fromEntries(
      approvals
        .filter((a) => a.snapshot)
        .map((a) => [
          a.month,
          a.snapshot as unknown as {
            data: TransparencyData;
            previousYear: TransparencyData;
          },
        ]),
    );
    const buffer =
      q.format === "pptx"
        ? await (
            await import("@/lib/public-presentation")
          ).publicPresentation(
            data,
            source.previousYear,
            q.scope,
            q.month,
            sources,
            q.report,
          )
        : await (
            await import("@/lib/public-workbook")
          ).publicWorkbook(data, q.scope, q.month, q.year, sources);
    const filename = `city-church-${q.format === "pptx" ? `${q.report}-` : ""}${q.scope === "year" ? `${q.year}-monthly-reports` : `${q.month}-${q.scope}`}.${q.format}`;
    await db.$transaction([
      db.reportArtifact.create({
        data: {
          filename,
          month: q.month,
          scope: q.scope,
          format: q.format,
          approved: source.approved,
          checksum: createHash("sha256").update(buffer).digest("hex"),
          contents: new Uint8Array(buffer),
        },
      }),
      db.publicExportLog.create({
        data: {
          viewerId: viewer.id,
          scope: q.format === "pptx" ? `pptx-${q.report}-${q.scope}` : q.scope,
          period: q.scope === "year" ? String(q.year) : q.month,
          ...auditContext(req),
        },
      }),
    ]);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          q.format === "pptx"
            ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const unauthorized =
      error instanceof Error && error.message === "GOOGLE_SIGN_IN_REQUIRED";
    if (!unauthorized) console.error("Transparency export failed", error);
    return NextResponse.json(
      {
        error: unauthorized
          ? "Sign in with Google to download files."
          : "Unable to export. Check the report options and try again.",
      },
      { status: unauthorized ? 401 : 400 },
    );
  }
}
