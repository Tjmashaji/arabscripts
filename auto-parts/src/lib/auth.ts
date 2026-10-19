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
};

// جلسة المستخدم الحالية مع ملفه وأدواره وصلاحياته. تُحسب مرة واحدة لكل طلب.
// الواجهة تستخدمها لإظهار ما يناسب المستخدم فقط؛ الحماية الفعلية في قاعدة البيانات (RLS والدوال).
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user || user.is_anonymous) return null;

  let { data: profile } = await supabase
    .from("ap_profiles")
    .select("full_name, phone, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) {
    // أول دخول لهذا الحساب على المنصة (المشروع مشترك، فلا ننشئ الملف بمشغّل على auth.users).
    const meta = user.user_metadata ?? {};
    const { data, error } = await supabase.rpc("ap_ensure_profile", {
      p_full_name: typeof meta.full_name === "string" ? meta.full_name : null,
      p_locale: typeof meta.locale === "string" ? meta.locale : null,
    });
    if (error || !data) throw new Error(`ap_ensure_profile failed: ${error?.message ?? "no data"}`);
    profile = data;
  }

  const [{ data: prefs }, { data: roles }] = await Promise.all([
    supabase.from("ap_user_preferences").select("locale").eq("user_id", user.id).maybeSingle(),
    supabase.from("ap_staff_roles").select("role").eq("user_id", user.id),
  ]);
  const staffRoles = (roles ?? []).map((r) => r.role as StaffRole);
  let permissions: string[] = [];
  if (staffRoles.length > 0 && profile!.status === "active") {
    const { data: perms } = await supabase.from("ap_roles_permissions").select("permission").in("role", staffRoles);
    permissions = (perms ?? []).map((p) => p.permission as string);
  }

  return {
    userId: user.id,
    email: user.email ?? "",
    fullName: profile!.full_name ?? "",
    phone: profile!.phone ?? null,
    status: profile!.status as Session["status"],
    locale: isLocale(prefs?.locale) ? prefs.locale : defaultLocale,
    staffRoles,
    permissions: new Set(permissions),
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
