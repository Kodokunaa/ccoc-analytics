import Link from "next/link";
export default function Unauthorized() {
  return (
    <main className="status-page">
      <h1>Access restricted</h1>
      <p>Your role does not allow access to this page.</p>
      <Link href="/">Return to transparency page</Link>
    </main>
  );
}
