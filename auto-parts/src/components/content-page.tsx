import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { Card, PageTitle } from "@/components/ui";
import { alternates } from "@/lib/seo";
import type { Locale } from "@/i18n/locales";

export type PageKey = "about" | "howItWorks" | "faq" | "privacy" | "terms";
type Section = { title: string; body: string[] };
type Faq = { q: string; a: string };
export const pagePaths: Record<PageKey, string> = {
  about: "/about", howItWorks: "/how-it-works", faq: "/faq", privacy: "/privacy", terms: "/terms",
};

export async function contentMetadata(locale: Locale, key: PageKey): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: `pages.${key}` });
  return { title: t("title"), description: t("description"), alternates: alternates(locale, pagePaths[key]) };
}

// صفحة محتوى ثابت من ملفات الترجمة: مقدمة، أقسام (عنوان + فقرات)، أو أسئلة شائعة قابلة للطي.
export async function ContentPage({ locale, pageKey, extra }: { locale: Locale; pageKey: PageKey; extra?: ReactNode }) {
  setRequestLocale(locale);
  const t = await getTranslations(`pages.${pageKey}`);
  const tp = await getTranslations("pages");
  const sections = (t.has("sections") ? t.raw("sections") : []) as Section[];
  const items = (t.has("items") ? t.raw("items") : []) as Faq[];

  return (
    <SiteShell locale={locale} path={pagePaths[pageKey]}>
      <article className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-2">
          <PageTitle>{t("title")}</PageTitle>
          {t.has("updated") && <p className="text-xs text-muted">{tp("updated", { date: t("updated") })}</p>}
          <p className="text-lg text-muted">{t("intro")}</p>
        </header>
        {extra}
        {sections.map((s) => (
          <section key={s.title} className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">{s.title}</h2>
            {s.body.map((p, i) => <p key={i} className="leading-relaxed">{p}</p>)}
          </section>
        ))}
        {items.length > 0 && (
          <div className="flex flex-col gap-2">
            {items.map((f) => (
              <details key={f.q} className="rounded-xl border border-line bg-card p-4">
                <summary className="cursor-pointer font-bold">{f.q}</summary>
                <p className="mt-2 leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        )}
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold">{tp("ctaTitle")}</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/products" className="rounded-lg border border-line px-4 py-2 text-sm font-bold">{tp("ctaSearch")}</Link>
            <Link href="/request-part" className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white">{tp("ctaRequest")}</Link>
          </div>
        </Card>
      </article>
    </SiteShell>
  );
}
