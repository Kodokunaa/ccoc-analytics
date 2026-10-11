import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  googleConfigured,
  consumeGoogleFlow,
  verifyGoogleIdToken,
  createGoogleSession,
  appOrigin,
} from "@/lib/google";
export async function GET(req: NextRequest) {
  let next = "/";
  try {
    if (!googleConfigured()) throw new Error("Google not configured");
    const flow = await consumeGoogleFlow(req.nextUrl.searchParams.get("state"));
    next = flow.next;
    if (req.nextUrl.searchParams.has("error"))
      return NextResponse.redirect(
        new URL(
          `/signin?error=cancelled&next=${encodeURIComponent(next)}`,
          appOrigin(),
        ),
      );
    const code = req.nextUrl.searchParams.get("code");
    if (!code) throw new Error("Missing authorization code");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${appOrigin()}/api/google/callback`,
        grant_type: "authorization_code",
        code_verifier: flow.verifier,
      }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Google token exchange failed");
    const token: unknown = await response.json();
    if (
      !token ||
      typeof token !== "object" ||
      !("id_token" in token) ||
      typeof token.id_token !== "string"
    )
      throw new Error("Missing identity token");
    const identity = await verifyGoogleIdToken(token.id_token, flow.nonce);
    const viewer = await db.googleViewer.upsert({
      where: { googleSubject: identity.googleSubject },
      create: identity,
      update: { name: identity.name, email: identity.email },
    });
    await createGoogleSession(viewer.id);
    return NextResponse.redirect(new URL(next, appOrigin()));
  } catch (error) {
    console.error(
      "Google sign-in failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.redirect(
      new URL(
        `/signin?error=failed&next=${encodeURIComponent(next)}`,
        appOrigin(),
      ),
    );
  }
}
