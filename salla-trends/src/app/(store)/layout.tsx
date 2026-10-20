import { AppShell } from "@/components/site";
import { VerifiedMark } from "@/components/ui";
import { requireStore } from "@/server/auth/session";
import { asStore } from "@/server/db";
import { myStore } from "@/server/queries";

const NAV = [
  { href: "/dashboard", label: "لوحتي" },
  { href: "/trends", label: "الترند" },
  { href: "/opportunities", label: "فرص لمتجري" },
  { href: "/verification", label: "التوثيق" },
  { href: "/settings", label: "الإعدادات" },
];

export default async function StoreLayout({ children }: LayoutProps<"/">) {
  const v = await requireStore();
  const store = await asStore(v.storeId, myStore);
  return (
    <AppShell
      nav={NAV}
      who={
        <span className="inline-flex items-center gap-1">
          {store?.verification_status === "verified" ? <VerifiedMark className="text-brand" /> : null}
          {store?.name || v.storeName}
        </span>
      }
    >
      {children}
    </AppShell>
  );
}
