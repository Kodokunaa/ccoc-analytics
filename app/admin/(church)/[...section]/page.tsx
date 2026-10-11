import Workspace from "@/components/workspace";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
const sections = [
  "dashboard",
  "services",
  "attendance",
  "giving",
  "analytics/attendance",
  "analytics/financial",
  "analytics/combined",
  "reports",
  "targets",
  "users",
  "audit-logs",
  "settings",
];
export default async function Page({
  params,
}: {
  params: Promise<{ section: string[] }>;
}) {
  const { section } = await params;
  const path = section.join("/");
  if (!sections.includes(path)) notFound();
  const user = await currentUser();
  if (
    ["users", "audit-logs", "settings"].includes(path) &&
    user?.role !== "SUPER_ADMIN"
  )
    redirect("/admin/unauthorized");
  return <Workspace section={path} />;
}
