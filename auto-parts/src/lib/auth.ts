import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { defaultLocale, isLocale, type Locale } from "@/i18n/locales";

export type StaffRole = "super_admin" | "operations_admin" | "finance_admin" | "support_agent";

export type Session = {
  userId: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: "active" | "suspended";
  locale: Locale;
  staffRoles: StaffRole[];
  permissions: ReadonlySet<string>;
  organizations: { id: string; role: string }[];
};

type ProfileRow = {
  full_name: string | null; phone: string | null; status: string;
  ap_user_preferences: { locale: string } | null;
  ap_staff_roles: { role: string }[];
  ap_organization_members: { organization_id: string; member_role: string; status: string }[];
};

const profileSelect = `full_name, phone, status, ap_user_preferences(locale), ap_staff_roles(role),
  ap_organization_members(organization_id, member_role, status)`;

// جلسة المستخدم الحالية مع ملفه وأدواره وصلاحياته. تُحسب مرة واحدة لكل طلب.
// الهوية من getClaims: توقيع الجلسة يُتحقق منه محليًا بمفتاح المشروع العام (ES256) دون رحلة لخادم الدخول،
// ثم الملف والأدوار والعضويات في استعلام واحد، والصلاحيات بالتوازي معه.
// الواجهة تستخدمها لإظهار ما يناسب المستخدم فقط؛ الحماية الفعلية في قاعدة البيانات (RLS والدوال).
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const claims = auth?.claims;
  if (!claims?.sub || claims.is_anonymous) return null;
  const userId = claims.sub;

  const loadProfile = () => supabase.from("ap_profiles").select(profileSelect).eq("user_id", userId).maybeSingle();
  const [first, { data: rolePerms }] = await Promise.all([
    loadProfile(),
    supabase.from("ap_roles_permissions").select("role, permission"),
  ]);
  let profile = first.data;
  if (!profile) {
    // أول دخول لهذا الحساب على المنصة (المشروع مشترك، فلا ننشئ الملف بمشغّل على auth.users).
    const meta = (claims.user_metadata ?? {}) as Record<string, unknown>;
    const { error } = await supabase.rpc("ap_ensure_profile", {
      p_full_name: typeof meta.full_name === "string" ? meta.full_name : null,
      p_locale: typeof meta.locale === "string" ? meta.locale : null,
    });
    if (error) throw new Error(`ap_ensure_profile failed: ${error.message}`);
    ({ data: profile } = await loadProfile());
    if (!profile) throw new Error("ap_ensure_profile failed: no profile");
  }
  const row = profile as unknown as ProfileRow;

  const staffRoles = row.ap_staff_roles.map((r) => r.role as StaffRole);
  const permissions = row.status === "active"
    ? (rolePerms ?? []).filter((p) => staffRoles.includes(p.role as StaffRole)).map((p) => p.permission as string)
    : [];

  return {
    userId,
    email: typeof claims.email === "string" ? claims.email : "",
    fullName: row.full_name ?? "",
    phone: row.phone ?? null,
    status: row.status as Session["status"],
    locale: isLocale(row.ap_user_preferences?.locale) ? row.ap_user_preferences.locale : defaultLocale,
    staffRoles,
    permissions: new Set(permissions),
    organizations: row.ap_organization_members.filter((m) => m.status === "active")
      .map((m) => ({ id: m.organization_id, role: m.member_role })),
  };
});

export function localePath(locale: string, path: string): string {
  return locale === defaultLocale ? path : `/${locale}${path === "/" ? "" : path}`;
}

export async function requireSession(locale: string, nextPath: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`${localePath(locale, "/login")}?next=${encodeURIComponent(nextPath)}`);
  return session;
}

export function isStaff(session: Session | null): boolean {
  return !!session && session.status === "active" && session.staffRoles.length > 0;
}

export async function requireStaff(locale: string, nextPath: string, permission?: string): Promise<Session> {
  const session = await requireSession(locale, nextPath);
  if (!isStaff(session) || (permission && !session.permissions.has(permission))) {
    redirect(localePath(locale, "/forbidden"));
  }
  return session;
}
