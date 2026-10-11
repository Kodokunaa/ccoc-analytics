"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="status-page">
      <h1>Something went wrong</h1>
      <p>Check the database connection and try again.</p>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
