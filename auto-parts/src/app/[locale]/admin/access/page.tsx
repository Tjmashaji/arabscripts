import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Alert, Button, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { grantStaffRole, revokeStaffRole } from "@/server/admin-actions";
import { localeFrom } from "@/i18n/locales";

const roles = ["super_admin", "operations_admin", "finance_admin", "support_agent"] as const;
const errorKeys = new Set(["userNotFound", "lastSuperAdmin", "actionFailed"]);
const okKeys = new Set(["granted", "revoked"]);

type StaffRow = { user_id: string; email: string; full_name: string; role: (typeof roles)[number]; granted_at: string };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "admin" }))("accessTitle") };
}

export default async function AccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  await requireStaff(locale, "/admin/access", "roles.manage");
  const { error, ok } = await searchParams;
  const t = await getTranslations("admin");
  const tRoles = await getTranslations("roles");
  const supabase = await createClient();
  const { data, error: listError } = await supabase.rpc("ap_admin_list_staff");
  const staff = (data ?? []) as StaffRow[];
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeZone: "Asia/Riyadh" });

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>{t("accessTitle")}</PageTitle>
      {error && errorKeys.has(error) && <Alert tone="danger">{t(error)}</Alert>}
      {listError && <Alert tone="danger">{t("actionFailed")}</Alert>}
      {ok && okKeys.has(ok) && <Alert tone="success">{t(ok)}</Alert>}

      <Card>
        <p className="mb-4 text-sm text-muted">{t("accessHelp")}</p>
        <form action={grantStaffRole} className="grid gap-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <input type="hidden" name="locale" value={locale} />
          <Field label={t("email")} htmlFor="email">
            <Input id="email" name="email" type="email" dir="ltr" required maxLength={254} />
          </Field>
          <Field label={t("role")} htmlFor="role">
            <Select id="role" name="role" defaultValue="support_agent">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {tRoles(r)}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">{t("grant")}</Button>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-surface text-start text-muted">
            <tr>
              <th className="px-4 py-3 text-start font-bold">{t("user")}</th>
              <th className="px-4 py-3 text-start font-bold">{t("role")}</th>
              <th className="px-4 py-3 text-start font-bold">{t("grantedAt")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {staff.map((row) => (
              <tr key={`${row.user_id}:${row.role}`} className="border-t border-line">
                <td className="px-4 py-3">
                  <span className="block font-bold">{row.full_name || "—"}</span>
                  <span className="ltr-value text-xs text-muted">{row.email}</span>
                </td>
                <td className="px-4 py-3">{tRoles(row.role)}</td>
                <td className="px-4 py-3">{dateFmt.format(new Date(row.granted_at))}</td>
                <td className="px-4 py-3 text-end">
                  <form action={revokeStaffRole}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="userId" value={row.user_id} />
                    <input type="hidden" name="role" value={row.role} />
                    <Button type="submit" variant="danger" className="min-h-9">
                      {t("revoke")}
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
