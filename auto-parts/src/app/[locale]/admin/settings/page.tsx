import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Card, Input, PageTitle } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateSetting } from "@/server/shipping-actions";
import { localeFrom } from "@/i18n/locales";

// إعدادات المنصة القابلة للتعديل (settings.edit). كل تغيير يُسجَّل في سجل التدقيق تلقائيًا.
const editable = ["service_fee_percent", "availability_max_age_hours"] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "settings" }))("title") };
}

export default async function Settings({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireStaff(locale, "/admin/settings", "settings.edit");
  const q = await searchParams;
  const t = await getTranslations("settings");
  const supabase = await createClient();
  const { data } = await supabase.from("ap_platform_settings").select("key, value, updated_at").in("key", [...editable]);
  const byKey = new Map((data ?? []).map((r) => [r.key as string, r]));

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageTitle>{t("title")}</PageTitle>
      {q.saved && <Alert tone="success">{t("saved")}</Alert>}
      {q.error && <Alert tone="danger">{t("failed")}</Alert>}
      {editable.map((key) => {
        const row = byKey.get(key);
        if (!row) return null;
        return (
          <Card key={key}>
            <form action={updateSetting} className="flex flex-col gap-2">
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="key" value={key} />
              <label htmlFor={key} className="font-bold">{t(`${key}`)}</label>
              <p className="text-xs text-muted">{t(`${key}_help`)}</p>
              <div className="flex gap-2">
                <Input id={key} name="value" defaultValue={String(row.value)} inputMode="decimal" dir="ltr" required className="max-w-40" />
                <SubmitButton variant="secondary">{t("save")}</SubmitButton>
              </div>
            </form>
          </Card>
        );
      })}
    </div>
  );
}
