import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { requireGoogleViewer } from "@/lib/google";
import { reserveExport } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { auditContext } from "@/lib/audit";
import { createHash } from "node:crypto";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const viewer = await requireGoogleViewer();
    if (!(await reserveExport(viewer.id)))
      return NextResponse.json(
        { error: "Please wait a minute." },
        { status: 429 },
      );
    const file = await db.reportArtifact.findUniqueOrThrow({
      where: { id: (await params).id },
    });
    if (
      createHash("sha256").update(file.contents).digest("hex") !== file.checksum
    )
      throw new Error("Archived report checksum mismatch");
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "EXPORT",
        entity: "report-archive",
        entityId: file.id,
        ...auditContext(req),
      },
    });
    return new NextResponse(new Uint8Array(file.contents), {
      headers: {
        "Content-Type":
          file.format === "pptx"
            ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            : file.format === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          msg === "GOOGLE_SIGN_IN_REQUIRED"
            ? "Sign in with Google to download files."
            : "Unable to download archived file",
      },
      {
        status: ["GOOGLE_SIGN_IN_REQUIRED", "UNAUTHENTICATED"].includes(msg)
          ? 401
          : 404,
      },
    );
  }
}
