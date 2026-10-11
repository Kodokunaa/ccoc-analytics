import Link from "next/link";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import ChurchLogo from "@/components/church-logo";
import GoogleMark from "@/components/google-mark";
import { googleConfigured, safeReturnPath } from "@/lib/google";
export const dynamic = "force-dynamic";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const q = await searchParams,
    next = safeReturnPath(q.next),
    configured = googleConfigured();
  const errors: Record<string, string> = {
    configuration:
      "Google sign-in is not available yet. You can still browse every public report.",
    cancelled:
      "Sign-in was cancelled. Your reports are still available to browse.",
    failed: "We couldn’t verify your Google sign-in. Please try again.",
  };
  return (
    <main className="public-signin">
      <Link className="public-back" href={next}>
        <ArrowLeft size={15} />
        Back to transparency
      </Link>
      <section className="panel google-login-card">
        <span className="signin-church">
          <ChurchLogo size={38} />
        </span>
        <span className="eyebrow">CITY CHURCH OF CHRIST</span>
        <h1>Take the report with you.</h1>
        <p>
          Use your Google account to download attendance, giving, and monthly
          reports. Everyone can view the data without signing in.
        </p>
        <div className="signin-feature">
          <Download size={17} />
          <span>Download Excel files and PowerPoint reports</span>
        </div>
        <div className="signin-feature">
          <ShieldCheck size={17} />
          <span>
            Your Google account stays separate from church administration
          </span>
        </div>
        {q.error && (
          <p className="notice" role="alert">
            {errors[q.error] ?? errors.failed}
          </p>
        )}
        {configured ? (
          <Link
            className="google-button"
            prefetch={false}
            href={`/api/google/start?next=${encodeURIComponent(next)}`}
          >
            <GoogleMark />
            Continue with Google
          </Link>
        ) : (
          <>
            <button className="google-button" disabled>
              <GoogleMark />
              Continue with Google
            </button>
            <p className="signin-note">
              Google sign-in is being set up. Please check back for downloads.
            </p>
          </>
        )}
        <small>
          We use your name and email to verify and record downloads. We do not
          request access to your Google Drive.
        </small>
      </section>
    </main>
  );
}
