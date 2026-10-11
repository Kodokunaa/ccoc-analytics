import Link from "next/link";
export default function NotFound() {
  return (
    <main className="status-page">
      <h1>Page not found</h1>
      <Link href="/">Return to transparency page</Link>
    </main>
  );
}
