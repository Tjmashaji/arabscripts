import { AppShell } from "@/components/site";
import { requireAdmin } from "@/server/auth/session";

const NAV = [
  { href: "/admin", label: "نظرة عامة" },
  { href: "/admin/verifications", label: "طلبات التوثيق" },
  { href: "/admin/stores", label: "المتاجر" },
];

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const a = await requireAdmin();
  return <AppShell nav={NAV} who={a.name}>{children}</AppShell>;
}
