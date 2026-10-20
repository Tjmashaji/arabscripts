import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { LanguageSwitcher } from "@/components/language-switcher";
import { localeFrom } from "@/i18n/locales";

// لوحة الإدارة بتصميم الملف المعتمد: شريط جانبي داكن ومحتوى على خلفية فاتحة.
// الحماية هنا للتنقل فقط؛ كل صفحة تتحقق من صلاحيتها، وقاعدة البيانات تتحقق مرة ثالثة.
export default async function AdminLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const locale = await localeFrom(params);
  const session = await requireStaff(locale, "/admin");
  const t = await getTranslations("admin");
  const tp = await getTranslations("adminPartners");
  const tcat = await getTranslations("adminCatalog");
  const tquo = await getTranslations("adminQuotes");
  const tRoles = await getTranslations("roles");
  const tNav = await getTranslations("nav");
  const brand = env.platformName ?? (await getTranslations("brand"))("name");

  const items = [
    { href: "/admin", label: t("overview"), show: true },
    { href: "/admin/partner-applications", label: tp("applications"), show: session.permissions.has("accounts.approve") },
    { href: "/admin/invitations", label: tp("invitations"), show: session.permissions.has("accounts.approve") },
    { href: "/admin/quotes", label: tquo("title"), show: session.permissions.has("quotes.manage") },
    { href: "/admin/products", label: tcat("products"), show: session.permissions.has("products.publish") },
    { href: "/admin/catalog", label: tcat("catalog"), show: session.permissions.has("products.publish") },
    { href: "/admin/access", label: t("access"), show: session.permissions.has("roles.manage") },
    { href: "/admin/audit", label: t("audit"), show: session.permissions.has("audit.read") },
  ] as const;

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="bg-ink text-white lg:min-h-dvh lg:w-60 lg:shrink-0">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <Link href="/" className="font-bold">
            {brand}
          </Link>
        </div>
        <nav aria-label={t("title")} className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible">
          {items
            .filter((i) => i.show)
            .map((i) => (
              <Link key={i.href} href={i.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-white/10">
                {i.label}
              </Link>
            ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card px-4 py-3">
          <p className="text-sm text-muted">
            {t("signedInAs", { name: session.fullName || session.email, role: session.staffRoles.map((r) => tRoles(r)).join("، ") })}
          </p>
          <div className="rounded-lg bg-ink p-1">
            <LanguageSwitcher current={locale} path="/admin" label={tNav("language")} />
          </div>
        </header>
        <main id="main" className="flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
