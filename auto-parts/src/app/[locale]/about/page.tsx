import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContentPage, contentMetadata } from "@/components/content-page";
import { Card } from "@/components/ui";
import { getPublicSettings } from "@/lib/site-data";
import { whatsappLink } from "@/lib/site";
import { localeFrom } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return contentMetadata(await localeFrom(params), "about");
}

// «من نحن» مع بيانات الجهة المشغّلة والتواصل كما أدخلها المدير (لا يظهر ما لم يُدخل).
export default async function About({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeFrom(params);
  const t = await getTranslations({ locale, namespace: "pages" });
  const s = await getPublicSettings();
  const rows = [
    s.legal_entity_name && [t("entity"), s.legal_entity_name],
    s.commercial_register && [t("cr"), s.commercial_register],
    s.contact_email && [t("email"), <a key="e" href={`mailto:${s.contact_email}`} className="text-accent ltr-value">{s.contact_email}</a>],
    s.contact_whatsapp && [t("whatsapp"), <a key="w" href={whatsappLink(s.contact_whatsapp)} target="_blank" rel="noopener" className="text-accent ltr-value">{s.contact_whatsapp}</a>],
  ].filter(Boolean) as [string, React.ReactNode][];
  const extra = rows.length > 0 ? (
    <Card>
      <h2 className="mb-3 font-bold">{t("operator")}</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className={k === t("cr") ? "ltr-value" : undefined}>{v}</dd></div>)}
      </dl>
    </Card>
  ) : null;
  return <ContentPage locale={locale} pageKey="about" extra={extra} />;
}
