import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card, PageTitle } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localeFrom } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "admin" }))("title") };
}

// أرقام حقيقية من قاعدة البيانات فقط؛ لا توجد مؤشرات لمراحل لم تُبنَ بعد.
export default async function AdminOverview({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const session = await requireStaff(locale, "/admin");
  const t = await getTranslations("admin");
  const supabase = await createClient();

  const count = async (query: PromiseLike<{ count: number | null }>) => (await query).count ?? 0;
  const [pendingOrgs, activeOrgs, pendingCaps, staff] = await Promise.all([
    count(supabase.from("ap_organizations").select("id", { count: "exact", head: true }).eq("status", "pending")),
    count(supabase.from("ap_organizations").select("id", { count: "exact", head: true }).eq("status", "active")),
    count(supabase.from("ap_organization_verifications").select("organization_id", { count: "exact", head: true }).eq("status", "requested")),
    session.permissions.has("roles.manage")
      ? count(supabase.from("ap_staff_roles").select("user_id", { count: "exact", head: true }))
      : Promise.resolve(null),
  ]);

  const fmt = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : locale);
  const tiles = [
    { label: t("pendingOrgs"), value: pendingOrgs },
    { label: t("pendingCapabilities"), value: pendingCaps },
    { label: t("activeOrgs"), value: activeOrgs },
    ...(staff === null ? [] : [{ label: t("staffCount"), value: staff }]),
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t("overview")}</PageTitle>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <p className="text-sm text-muted">{tile.label}</p>
            <p className="mt-2 text-3xl font-bold">{fmt.format(tile.value)}</p>
          </Card>
        ))}
      </div>
      <p className="text-sm text-muted">{t("comingNext")}</p>
    </div>
  );
}
