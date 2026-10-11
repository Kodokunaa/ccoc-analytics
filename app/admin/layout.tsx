import type { Metadata } from "next";
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Staff workspace | City Church of Christ",
};
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
