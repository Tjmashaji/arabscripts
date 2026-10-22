import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Input, PageTitle } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { editableSettings, numericSettings, paymentSettings, type NumericSetting } from "@/lib/site";
import { updateSetting } from "@/server/shipping-actions";
import { localeFrom } from "@/i18n/locales";

// إعدادات المنصة القابلة للتعديل (settings.edit). كل تغيير يُسجَّل في سجل التدقيق تلقائيًا.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "settings" }))("title") };
}

export default async function Settings({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ saved?: string; error?: string; key?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireStaff(locale, "/admin/settings", "settings.edit");
  const q = await searchParams;
  const t = await getTranslations("settings");
  const supabase = await createClient();
  const { data } = await supabase.from("ap_platform_settings").select("key, value").in("key", editableSettings);
  const byKey = new Map((data ?? []).map((r) => [r.key as string, r.value]));
  const isPayment = (k: string) => (paymentSettings as readonly string[]).includes(k);
  const groups = [
    { title: t("operatorTitle"), help: t("operatorHelp"), keys: editableSettings.filter((k) => !(k in numericSettings) && !isPayment(k)) },
    { title: t("paymentTitle"), help: t("paymentHelp"), keys: editableSettings.filter(isPayment) },
    { title: t("operationsTitle"), help: null, keys: editableSettings.filter((k) => k in numericSettings) },
  ];

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageTitle>{t("title")}</PageTitle>
      {q.saved && <Alert tone="success">{t("saved")}</Alert>}
      {q.error && <Alert tone="danger">{t("failed")}{q.key && t.has(q.key) ? ` (${t(q.key)})` : ""}</Alert>}
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{g.title}</h2>
          {g.help && <p className="text-sm text-muted">{g.help}</p>}
          {g.keys.map((key) => {
            if (!byKey.has(key)) return null;
            const numeric = key in numericSettings;
            return (
              <Card key={key}>
                <form action={updateSetting} className="flex flex-col gap-2">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="key" value={key} />
                  <label htmlFor={key} className="font-bold">{t(key)}</label>
                  <p className="text-xs text-muted">{t(`${key}_help`)}</p>
                  <div className="flex gap-2">
                    <Input id={key} name="value" defaultValue={String(byKey.get(key) ?? "")}
                      dir={key === "legal_entity_name" || key === "bank_name" || key === "bank_account_name" ? undefined : "ltr"}
                      inputMode={numeric || key === "commercial_register" ? "decimal" : key === "contact_whatsapp" ? "tel" : key === "contact_email" ? "email" : undefined}
                      required={numeric} className={numeric ? "max-w-40" : ""}
                      max={numeric ? numericSettings[key as NumericSetting].max : undefined} />
                    <SubmitButton variant="secondary">{t("save")}</SubmitButton>
                  </div>
                </form>
              </Card>
            );
          })}
        </section>
      ))}
    </div>
  );
}
