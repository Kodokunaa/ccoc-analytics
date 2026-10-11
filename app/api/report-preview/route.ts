import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { reportSource } from "@/lib/report-source";
import { presentationSlides } from "@/lib/presentation-model";
import { z } from "zod";
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const month = z
      .string()
      .regex(/^(199\d|20\d\d|2100)-(0[1-9]|1[0-2])$/)
      .parse(req.nextUrl.searchParams.get("month"));
    const source = await reportSource(month);
    return NextResponse.json(
      {
        slides: presentationSlides(source.data, source.previousYear, month),
        churchName: source.data.churchName,
        approved: source.approved,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Unable to preview report" },
      {
        status:
          error instanceof Error && error.message === "UNAUTHENTICATED"
            ? 401
            : 400,
      },
    );
  }
}
