import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { env } from "@/lib/env";
import { getPublicSettings } from "@/lib/site-data";
import { whatsappLink } from "@/lib/site";

// التذييل: روابط الثقة والسياسات، وبيانات الجهة المشغّلة والتواصل كما أدخلها المدير (لا يظهر ما لم يُدخل).
export async function SiteFooter() {
  const t = await getTranslations("footer");
  const tc = await getTranslations("common");
  const brand = env.platformName ?? (await getTranslations("brand"))("name");
  const s = await getPublicSettings();
  const groups = [
    { title: t("platform"), links: [["/about", t("about")], ["/how-it-works", t("howItWorks")], ["/faq", t("faq")]] },
    { title: t("services"), links: [["/products", t("products")], ["/request-part", t("requestPart")], ["/track", t("track")]] },
    { title: t("legal"), links: [["/privacy", t("privacy")], ["/terms", t("terms")]] },
  ] as const;

  return (
    <footer className="border-t border-line bg-card">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 lg:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-2 lg:col-span-1">
          <p className="font-bold">{brand}</p>
          <p className="text-sm text-muted">{tc("footer")}</p>
          {(s.contact_email || s.contact_whatsapp) && (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {s.contact_email && <li><a href={`mailto:${s.contact_email}`} className="text-accent ltr-value">{s.contact_email}</a></li>}
              {s.contact_whatsapp && (
                <li><a href={whatsappLink(s.contact_whatsapp)} target="_blank" rel="noopener" className="text-accent">{t("whatsapp")} <span className="ltr-value">{s.contact_whatsapp}</span></a></li>
              )}
            </ul>
          )}
        </div>
        {groups.map((g) => (
          <nav key={g.title} aria-label={g.title} className="flex flex-col gap-2 text-sm">
            <p className="font-bold">{g.title}</p>
            {g.links.map(([href, label]) => <Link key={href} href={href} className="text-muted hover:text-ink">{label}</Link>)}
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-4 py-4 text-xs text-muted">
          <span>© {new Date().getFullYear()} {s.legal_entity_name || brand}</span>
          {s.commercial_register && <span>{t("cr")}: <span className="ltr-value">{s.commercial_register}</span></span>}
        </p>
      </div>
    </footer>
  );
}
