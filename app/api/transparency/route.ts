import { NextRequest, NextResponse } from "next/server";
import { getTransparency, publicQuerySchema } from "@/lib/transparency";
export async function GET(req: NextRequest) {
  try {
    const parsed = publicQuerySchema.parse({
      year: req.nextUrl.searchParams.get("year"),
    });
    return NextResponse.json(await getTransparency(parsed.year), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "Unable to load transparency data",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      {
        error: "Unable to load reports. Check the selected year and try again.",
      },
      { status: 400 },
    );
  }
}
