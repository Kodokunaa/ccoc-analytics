import { NextRequest, NextResponse } from "next/server";
import {
  googleConfigured,
  beginGoogleFlow,
  safeReturnPath,
  appOrigin,
} from "@/lib/google";
export async function GET(req: NextRequest) {
  const next = safeReturnPath(req.nextUrl.searchParams.get("next"));
  if (!googleConfigured())
    return NextResponse.redirect(
      new URL(
        `/signin?error=configuration&next=${encodeURIComponent(next)}`,
        appOrigin(),
      ),
    );
  return NextResponse.redirect(await beginGoogleFlow(next));
}
