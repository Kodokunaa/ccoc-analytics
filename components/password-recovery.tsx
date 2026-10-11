"use client";
import { useState } from "react";
import Link from "next/link";
export default function PasswordRecovery({ token }: { token?: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  return (
    <main className="login-form recovery-page">
      <section className="login-card">
        <span className="eyebrow">STAFF ACCESS</span>
        <h1>{token ? "Reset your password" : "Forgot your password?"}</h1>
        <p>
          {token
            ? "Choose a new staff password. Reset links expire after 30 minutes and work once."
            : "Enter your staff email to request a password reset link."}
        </p>
        {!message && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              const values = Object.fromEntries(new FormData(e.currentTarget));
              if (token && values.password !== values.confirm) {
                setError("Passwords do not match.");
                setBusy(false);
                return;
              }
              try {
                const res = await fetch("/api/password-reset", {
                  method: token ? "PATCH" : "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(
                    token
                      ? { token, password: values.password }
                      : { email: values.email },
                  ),
                });
                const result = await res.json();
                if (!res.ok) throw new Error(result.error);
                setMessage(result.message);
                window.history.replaceState(null, "", "/admin/reset-password");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to continue");
              } finally {
                setBusy(false);
              }
            }}
          >
            {token ? (
              <>
                <label>
                  New password
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={12}
                    maxLength={72}
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  Confirm password
                  <input
                    name="confirm"
                    type="password"
                    required
                    minLength={12}
                    maxLength={72}
                    autoComplete="new-password"
                  />
                </label>
              </>
            ) : (
              <label>
                Staff email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : token
                  ? "Update password"
                  : "Send reset link"}
            </button>
          </form>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        <Link className="text-link" href="/admin/login">
          Back to staff sign-in
        </Link>
      </section>
    </main>
  );
}
