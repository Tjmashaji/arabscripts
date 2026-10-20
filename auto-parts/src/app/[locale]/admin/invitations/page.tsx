import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SubmitButton } from "@/components/submit-button";
import { CopyField } from "@/components/copy-field";
import { Alert, Badge, Card, Field, Input, PageTitle, Select, Textarea, statusTone } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createInvitation, revokeInvitation } from "@/server/admin-actions";
import { capabilities } from "@/lib/partners";
import { localeFrom, localeNames, locales } from "@/i18n/locales";

type Row = { id: string; email: string; expected_capabilities: string[]; preferred_locale: string; status: string; expires_at: string; created_at: string };

// الدعوة التي تجاوزت تاريخها تظهر «انتهت» حتى قبل أن يفتحها أحد (قاعدة البيانات تحدّث حالتها عند الفتح).
async function loadInvitations() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ap_invitations")
    .select("id, email, expected_capabilities, preferred_locale, status, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const now = Date.now();
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    status: ["created", "opened"].includes(r.status) && new Date(r.expires_at).getTime() < now ? "expired" : r.status,
  }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "adminPartners" }))("invitations") };
}

export default async function InvitationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ created?: string; error?: string; revoked?: string; mail?: string; to?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireStaff(locale, "/admin/invitations", "accounts.approve");
  const q = await searchParams;
  const t = await getTranslations("adminPartners");
  const tc = await getTranslations("capabilities");
  const ts = await getTranslations("invStatus");
  // الرابط محفوظ لدقيقتين في كوكي خاص بعد الإنشاء، ويُعرض مرة واحدة فقط.
  const link = q.created ? (await cookies()).get("ap_invite_link")?.value : undefined;

  const rows = await loadInvitations();
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeZone: "Asia/Riyadh" });

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t("invitations")}</PageTitle>
      {q.error && <Alert tone="danger">{t("actionFailed")}</Alert>}
      {link && q.mail === "sent" && <Alert tone="success">{t("emailSent", { email: q.to ?? "" })}</Alert>}
      {link && q.mail === "failed" && <Alert tone="danger">{t("emailFailed")}</Alert>}
      {link && (
        <Alert tone={q.mail === "sent" ? "info" : "success"}>
          <span className="mb-2 block">{q.mail === "sent" ? t("linkBackup") : t("linkReady")}</span>
          <CopyField value={link} />
          {q.mail !== "sent" && q.mail !== "failed" && <span className="mt-2 block text-xs">{t("emailNotConfigured")}</span>}
        </Alert>
      )}

      <Card>
        <h2 className="mb-4 font-bold">{t("newInvitation")}</h2>
        <form action={createInvitation} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("email")} htmlFor="email">
            <Input id="email" name="email" type="email" dir="ltr" required maxLength={254} />
          </Field>
          <Field label={t("locale")} htmlFor="inviteLocale">
            <Select id="inviteLocale" name="inviteLocale" defaultValue={locale}>
              {locales.map((l) => (
                <option key={l} value={l} lang={l}>
                  {localeNames[l]}
                </option>
              ))}
            </Select>
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-bold">{t("capabilities")}</legend>
            <div className="flex flex-wrap gap-4">
              {capabilities.map((c) => (
                <label key={c} className="flex items-center gap-2">
                  <input type="checkbox" name="capabilities" value={c} />
                  {tc(c)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="sm:col-span-2">
            <Field label={t("message")} htmlFor="message">
              <Textarea id="message" name="message" maxLength={1000} />
            </Field>
          </div>
          <Field label={t("validDays")} htmlFor="validDays">
            <Input id="validDays" name="validDays" type="number" min={1} max={60} defaultValue={14} dir="ltr" />
          </Field>
          <div className="flex items-end">
            <SubmitButton>{t("create")}</SubmitButton>
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t("none")}</p>
        ) : (
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-4 py-3 text-start font-bold">{t("email")}</th>
                <th className="px-4 py-3 text-start font-bold">{t("capabilities")}</th>
                <th className="px-4 py-3 text-start font-bold">{t("status")}</th>
                <th className="px-4 py-3 text-start font-bold">{t("expires")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="ltr-value px-4 py-3">{r.email}</td>
                  <td className="px-4 py-3">{r.expected_capabilities.map((c) => tc(c)).join("، ")}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(r.status)}>{ts(r.status)}</Badge>
                  </td>
                  <td className="px-4 py-3">{dateFmt.format(new Date(r.expires_at))}</td>
                  <td className="px-4 py-3 text-end">
                    {["created", "opened"].includes(r.status) && (
                      <form action={revokeInvitation}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="id" value={r.id} />
                        <SubmitButton variant="danger" className="min-h-9">
                          {t("revoke")}
                        </SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
