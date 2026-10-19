import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteShell } from "@/components/site-shell";
import { Card } from "@/components/ui";
import { localeFrom } from "@/i18n/locales";

// الأسماء التجارية للعلامات كما تُكتب رسميًا؛ لا تُترجم.
const brands = [
  { latin: "Chery", ar: "شيري", zh: "奇瑞" },
  { latin: "Changan", ar: "شانجان", zh: "长安" },
  { latin: "Jetour", ar: "جيتور", zh: "捷途" },
  { latin: "Geely", ar: "جيلي", zh: "吉利" },
  { latin: "Haval", ar: "هافال", zh: "哈弗" },
];

const stepKeys = ["s1", "s2", "s3", "s4", "s5"] as const;
const principleKeys = ["p1", "p2", "p3"] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const t = await getTranslations("home");

  return (
    <SiteShell locale={locale} path="/">
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-10">
          <p className="text-sm font-bold text-accent">{t("brandsLine")}</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-snug sm:text-4xl">{t("title")}</h1>
          <p className="mt-4 max-w-2xl text-white/75">{t("subtitle")}</p>
          <p className="mt-6 max-w-2xl rounded-lg border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/85">{t("notice")}</p>
        </div>
      </section>

      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-10">
        <section aria-labelledby="brands">
          <h2 id="brands" className="text-xl font-bold">
            {t("brandsTitle")}
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {brands.map((b) => (
              <li key={b.latin} className="rounded-xl border border-line bg-card px-4 py-5 text-center">
                <span className="block font-bold">{locale === "ar" ? b.ar : locale === "zh" ? b.zh : b.latin}</span>
                {locale !== "en" && <span className="ltr-value mt-1 block text-xs text-muted">{b.latin}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how">
          <h2 id="how" className="text-xl font-bold">
            {t("howTitle")}
          </h2>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {stepKeys.map((key, i) => (
              <li key={key} className="rounded-xl border border-line bg-card p-4">
                <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft font-bold text-accent">
                  {(i + 1).toLocaleString(locale === "ar" ? "ar-SA" : locale)}
                </span>
                <h3 className="mt-3 font-bold">{t(`steps.${key}.title`)}</h3>
                <p className="mt-1 text-sm text-muted">{t(`steps.${key}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="text-lg font-bold">{t("principlesTitle")}</h2>
            <ul className="mt-3 flex list-disc flex-col gap-2 ps-5 text-sm">
              {principleKeys.map((key) => (
                <li key={key}>{t(`principles.${key}`)}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">{t("partnerTitle")}</h2>
            <p className="mt-3 text-sm text-muted">{t("partnerBody")}</p>
          </Card>
        </div>
      </div>
    </SiteShell>
  );
}
