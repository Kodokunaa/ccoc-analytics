import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { currentGoogleViewer, googleConfigured } from "@/lib/google";
import { hashToken } from "@/lib/auth";
import { db } from "@/lib/db";
export async function GET() {
  return NextResponse.json(
    { viewer: await currentGoogleViewer(), configured: googleConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function DELETE(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Invalid request origin" },
      { status: 403 },
    );
  const jar = await cookies(),
    token = jar.get("ccoc_google_session")?.value;
  if (token)
    await db.googleViewerSession.deleteMany({
      where: { id: hashToken(token) },
    });
  jar.delete("ccoc_google_session");
  return NextResponse.json({ ok: true });
}
