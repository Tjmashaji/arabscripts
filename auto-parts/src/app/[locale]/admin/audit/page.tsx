import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alert, Card, PageTitle } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { localeFrom } from "@/i18n/locales";

type AuditRow = { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; created_at: string };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "admin" }))("auditTitle") };
}

export default async function AuditPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireStaff(locale, "/admin/audit", "audit.read");
  const t = await getTranslations("admin");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ap_audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as AuditRow[];

  // أسماء المنفذين متاحة لمن يملك صلاحية قراءة الملفات؛ وإلا يظهر جزء من المعرّف.
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id))];
  const { data: actors } = actorIds.length
    ? await supabase.from("ap_profiles").select("user_id, full_name").in("user_id", actorIds)
    : { data: [] };
  const names = new Map((actors ?? []).map((a) => [a.user_id as string, a.full_name as string]));
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  });

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t("auditTitle")}</PageTitle>
      <p className="text-sm text-muted">{t("auditHelp")}</p>
      {error && <Alert tone="danger">{t("actionFailed")}</Alert>}
      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t("auditEmpty")}</p>
        ) : (
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-4 py-3 text-start font-bold">{t("when")}</th>
                <th className="px-4 py-3 text-start font-bold">{t("actor")}</th>
                <th className="px-4 py-3 text-start font-bold">{t("action")}</th>
                <th className="px-4 py-3 text-start font-bold">{t("entity")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3 whitespace-nowrap">{dateFmt.format(new Date(r.created_at))}</td>
                  <td className="px-4 py-3">
                    {r.actor_id ? names.get(r.actor_id) || <span className="ltr-value">{r.actor_id.slice(0, 8)}</span> : t("system")}
                  </td>
                  <td className="ltr-value px-4 py-3">{r.action}</td>
                  <td className="px-4 py-3">
                    <span className="ltr-value block">{r.entity_type}</span>
                    {r.entity_id && <span className="ltr-value block text-xs text-muted">{r.entity_id}</span>}
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
