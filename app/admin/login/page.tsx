"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import ChurchLogo from "@/components/church-logo";
import Link from "next/link";
import { loginSchema } from "@/lib/validation";
export default function Login() {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="login">
      <section className="login-story">
        <div className="brand">
          <ChurchLogo size={46} />
          <span>
            City Church
            <br />
            of Christ
          </span>
        </div>
        <div>
          <span className="eyebrow">
            FAITHFUL STEWARDSHIP. CLEARER INSIGHT.
          </span>
          <h1>
            Every number
            <br />
            {" tells a story."}
          </h1>
          <p>
            A thoughtful space to understand our church’s growth, care for our
            community, and steward what we’ve been given.
          </p>
        </div>
        <small>City Church of Christ · Church Performance Analytics</small>
      </section>
      <section className="login-form">
        <div className="login-card">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Sign in to your workspace</h2>
          <p>Administrators and encoders: enter your staff account details.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              try {
                const f = new FormData(e.currentTarget),
                  data = loginSchema.parse(Object.fromEntries(f));
                const res = await fetch("/api/auth", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data),
                });
                const result = await res.json();
                if (!res.ok) throw new Error(result.error);
                router.push("/admin/dashboard");
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to sign in");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
                placeholder="you@church.org"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <>
                  Sign in
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
          <small>Authorized church staff only.</small>
          <Link href="/admin/forgot-password" className="text-link">
            Forgot password?
          </Link>
        </div>
      </section>
    </main>
  );
}
