import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { AdminOverview } from "@/components/admin-overview";

export default async function Admin() {
  const u = await requireUser();
  if (!u.isAdmin) redirect("/projects");
  return <AdminOverview />;
}
