import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge, Card, Input, PageTitle, Select, statusTone } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { applicationStatuses, capabilities, isCapability } from "@/lib/partners";
import { localeFrom } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "adminPartners" }))("applications") };
}

type Row = {
  id: string; status: string; submitted_at: string | null; created_at: string; invitation_id: string | null;
  organization: { legal_name: string; country_code: string; preferred_locale: string; ap_organization_verifications: { capability: string; status: string }[] };
  ap_verification_documents: { id: string }[];
};

export default async function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; country?: string; capability?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireStaff(locale, "/admin/partner-applications", "accounts.approve");
  const q = await searchParams;
  const t = await getTranslations("adminPartners");
  const tc = await getTranslations("capabilities");
  const tas = await getTranslations("appStatus");
  const supabase = await createClient();

  let query = supabase
    .from("ap_partner_applications")
    .select("id, status, submitted_at, created_at, invitation_id, organization:ap_organizations!inner(legal_name, country_code, preferred_locale, ap_organization_verifications(capability, status)), ap_verification_documents(id)")
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (q.status && (applicationStatuses as readonly string[]).includes(q.status)) query = query.eq("status", q.status);
  if (q.country && /^[A-Za-z]{2}$/.test(q.country)) query = query.eq("organization.country_code", q.country.toUpperCase());
  const { data } = await query;
  let rows = (data ?? []) as unknown as Row[];
  if (isCapability(q.capability)) rows = rows.filter((r) => r.organization.ap_organization_verifications.some((v) => v.capability === q.capability));
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeZone: "Asia/Riyadh" });

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t("applications")}</PageTitle>
      <Card>
        <form className="grid gap-3 sm:grid-cols-4" method="get">
          <Select name="status" defaultValue={q.status ?? ""} aria-label={t("status")}>
            <option value="">{t("filterStatus")}</option>
            {applicationStatuses.map((s) => (
              <option key={s} value={s}>
                {tas(s)}
              </option>
            ))}
          </Select>
          <Select name="capability" defaultValue={q.capability ?? ""} aria-label={t("capabilities")}>
            <option value="">{t("capabilities")}</option>
            {capabilities.map((c) => (
              <option key={c} value={c}>
                {tc(c)}
              </option>
            ))}
          </Select>
          <Input name="country" defaultValue={q.country ?? ""} placeholder={t("filterCountry")} maxLength={2} dir="ltr" aria-label={t("filterCountry")} />
          <button type="submit" className="min-h-11 rounded-lg border border-line bg-card px-4 text-sm font-bold">
            {t("filter")}
          </button>
        </form>
      </Card>
      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t("none")}</p>
        ) : (
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-4 py-3 text-start font-bold">{t("org")}</th>
                <th className="px-4 py-3 text-start font-bold">{t("country")}</th>
                <th className="px-4 py-3 text-start font-bold">{t("capabilities")}</th>
                <th className="px-4 py-3 text-start font-bold">{t("status")}</th>
                <th className="px-4 py-3 text-start font-bold">{t("submittedAt")}</th>
                <th className="px-4 py-3 text-start font-bold">{t("docsCount")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <Link href={`/admin/partner-applications/${r.id}`} className="font-bold text-accent">
                      {r.organization.legal_name}
                    </Link>
                    <span className="ms-2 text-xs text-muted">{r.invitation_id ? t("sourceInvite") : t("sourceSelf")}</span>
                  </td>
                  <td className="ltr-value px-4 py-3">{r.organization.country_code}</td>
                  <td className="px-4 py-3">{r.organization.ap_organization_verifications.map((v) => tc(v.capability)).join("، ")}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(r.status)}>{tas(r.status)}</Badge>
                  </td>
                  <td className="px-4 py-3">{r.submitted_at ? dateFmt.format(new Date(r.submitted_at)) : "—"}</td>
                  <td className="px-4 py-3">{r.ap_verification_documents.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
