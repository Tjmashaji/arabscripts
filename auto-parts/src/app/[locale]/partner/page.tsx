import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Badge, Card, PageTitle, statusTone } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markNotificationsRead } from "@/server/partner-actions";
import { localeFrom } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "partner" }))("portal") };
}

export default async function PartnerHome({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const session = await requireSession(locale, "/partner");
  const t = await getTranslations("partner");
  const tc = await getTranslations("capabilities");
  const tcs = await getTranslations("capStatus");
  const tas = await getTranslations("appStatus");
  const supabase = await createClient();

  const [{ data: apps }, { data: notes }] = await Promise.all([
    supabase
      .from("ap_partner_applications")
      .select("id, status, decision_reason, organization:ap_organizations(id, legal_name, status, ap_organization_verifications(capability, status, decision_reason))")
      .order("created_at"),
    supabase.from("ap_notifications").select("id, kind, payload, read_at, created_at").order("created_at", { ascending: false }).limit(10),
  ]);
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const unread = (notes ?? []).filter((n) => !n.read_at).length;

  return (
    <SiteShell locale={locale} path="/partner">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageTitle>{t("portal")}</PageTitle>
          <Link href="/partner/products" className="rounded-lg border border-line bg-card px-4 py-2 text-sm font-bold">
            {(await getTranslations("partnerProducts"))("title")}
          </Link>
        </div>
        {(apps ?? []).length === 0 && session.organizations.length === 0 && <Alert tone="info">{t("noOrg")}</Alert>}

        {(apps ?? []).map((app) => {
          const org = app.organization as unknown as {
            legal_name: string;
            ap_organization_verifications: { capability: string; status: string; decision_reason: string | null }[];
          };
          return (
            <Card key={app.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{org.legal_name}</h2>
                <Badge tone={statusTone(app.status)}>{tas(app.status)}</Badge>
              </div>
              {app.decision_reason && (
                <p className="text-sm">
                  <span className="font-bold">{t("decisionTitle")}: </span>
                  {app.decision_reason}
                </p>
              )}
              <div>
                <h3 className="mb-2 text-sm font-bold">{t("capsTitle")}</h3>
                <ul className="flex flex-wrap gap-2">
                  {org.ap_organization_verifications.map((v) => (
                    <li key={v.capability}>
                      <Badge tone={statusTone(v.status)}>
                        {tc(v.capability)} · {tcs(v.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <Link href="/partner/application" className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white">
                {["draft_application", "changes_requested"].includes(app.status) ? t("edit") : t("view")}
              </Link>
            </Card>
          );
        })}

        {(notes ?? []).length > 0 && (
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{t("notifications")}</h2>
              {unread > 0 && (
                <form action={markNotificationsRead}>
                  <input type="hidden" name="locale" value={locale} />
                  <SubmitButton variant="secondary" className="min-h-9">
                    ✓
                  </SubmitButton>
                </form>
              )}
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              {(notes ?? []).map((n) => (
                <li key={n.id} className={n.read_at ? "text-muted" : "font-bold"}>
                  {t.has(`notif_${n.kind}`) ? t(`notif_${n.kind}`) : n.kind}
                  {(n.payload as { reason?: string })?.reason ? ` — ${(n.payload as { reason?: string }).reason}` : ""}
                  <span className="ms-2 text-xs font-normal text-muted">{dateFmt.format(new Date(n.created_at))}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </SiteShell>
  );
}
