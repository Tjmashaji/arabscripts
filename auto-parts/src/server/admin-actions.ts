"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { localePath, requireStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { isCapability } from "@/lib/partners";
import { isLocale } from "@/i18n/locales";
import { formLocale, text } from "./form";

const roleSchema = z.enum(["super_admin", "operations_admin", "finance_admin", "support_agent"]);

function done(locale: string, query: string): never {
  revalidatePath("/[locale]/admin/access", "page");
  redirect(`${localePath(locale, "/admin/access")}?${query}`);
}

// الصلاحية تُفحص هنا للرسائل الواضحة، وتُفحص مرة أخرى داخل دوال قاعدة البيانات (هي الحاجز الفعلي).
export async function grantStaffRole(form: FormData) {
  const locale = formLocale(form);
  await requireStaff(locale, "/admin/access", "roles.manage");
  const role = roleSchema.safeParse(form.get("role"));
  const email = z.email().safeParse(text(form, "email", 254));
  if (!role.success || !email.success) done(locale, "error=userNotFound");

  const supabase = await createClient();
  const { data: users, error: findError } = await supabase.rpc("ap_admin_find_user", { p_email: email.data });
  if (findError) done(locale, "error=actionFailed");
  if (!users || users.length === 0) done(locale, "error=userNotFound");
  const { error } = await supabase.rpc("ap_admin_set_staff_role", { p_user_id: users[0].user_id, p_role: role.data, p_grant: true });
  done(locale, error ? "error=actionFailed" : "ok=granted");
}

export async function revokeStaffRole(form: FormData) {
  const locale = formLocale(form);
  await requireStaff(locale, "/admin/access", "roles.manage");
  const role = roleSchema.safeParse(form.get("role"));
  const userId = z.uuid().safeParse(text(form, "userId", 64));
  if (!role.success || !userId.success) done(locale, "error=actionFailed");

  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_admin_set_staff_role", { p_user_id: userId.data, p_role: role.data, p_grant: false });
  if (error?.message.includes("last super admin")) done(locale, "error=lastSuperAdmin");
  done(locale, error ? "error=actionFailed" : "ok=revoked");
}

// ───────── دعوات الشركاء ─────────
const invitePage = (locale: string, query: string) => `${localePath(locale, "/admin/invitations")}?${query}`;

export async function createInvitation(form: FormData) {
  const locale = formLocale(form);
  await requireStaff(locale, "/admin/invitations", "accounts.approve");
  const email = z.email().max(254).safeParse(text(form, "email", 254));
  const caps = form.getAll("capabilities").filter(isCapability);
  const days = Number(text(form, "validDays", 3) || "14");
  const inviteLocale = isLocale(form.get("inviteLocale")) ? String(form.get("inviteLocale")) : "ar";
  if (!email.success || caps.length === 0 || !Number.isInteger(days) || days < 1 || days > 60) {
    redirect(invitePage(locale, "error=invalid"));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_admin_create_invitation", {
    p_email: email.data,
    p_capabilities: caps,
    p_locale: inviteLocale,
    p_message: text(form, "message", 1000) || null,
    p_valid_days: days,
  });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row?.token) redirect(invitePage(locale, "error=failed"));
  // الرابط يُعرض مرة واحدة؛ لا يُخزَّن الرمز الخام في أي مكان.
  const link = `${env.siteUrl}${localePath(inviteLocale, `/invite/${row.token}`)}`;
  (await cookies()).set("ap_invite_link", link, { path: "/", httpOnly: true, sameSite: "strict", maxAge: 120, secure: true });
  redirect(invitePage(locale, "created=1"));
}

export async function revokeInvitation(form: FormData) {
  const locale = formLocale(form);
  await requireStaff(locale, "/admin/invitations", "accounts.approve");
  const id = z.uuid().safeParse(text(form, "id", 64));
  if (!id.success) redirect(invitePage(locale, "error=failed"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_admin_revoke_invitation", { p_id: id.data });
  redirect(invitePage(locale, error ? "error=failed" : "revoked=1"));
}

// ───────── مراجعة طلبات الاعتماد ─────────
const reviewPage = (locale: string, id: string, query: string) =>
  `${localePath(locale, `/admin/partner-applications/${id}`)}?${query}`;

export async function startReview(form: FormData) {
  const locale = formLocale(form);
  await requireStaff(locale, "/admin/partner-applications", "accounts.approve");
  const id = z.uuid().safeParse(text(form, "id", 64));
  if (!id.success) redirect(localePath(locale, "/admin/partner-applications"));
  const supabase = await createClient();
  await supabase.rpc("ap_admin_start_review", { p_app: id.data });
  redirect(reviewPage(locale, id.data, "started=1"));
}

export async function reviewApplication(form: FormData) {
  const locale = formLocale(form);
  await requireStaff(locale, "/admin/partner-applications", "accounts.approve");
  const id = z.uuid().safeParse(text(form, "id", 64));
  const decision = z.enum(["approved", "rejected", "changes_requested"]).safeParse(form.get("decision"));
  if (!id.success) redirect(localePath(locale, "/admin/partner-applications"));
  if (!decision.success) redirect(reviewPage(locale, id.data, "error=decision"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_admin_review_application", {
    p_app: id.data,
    p_decision: decision.data,
    p_reason: text(form, "reason", 2000) || null,
    p_approved: form.getAll("approve").filter(isCapability),
    p_requested_fields: form.getAll("fields").map(String).filter((f) => /^[a-z_]{2,40}$/.test(f)),
    p_override_reason: text(form, "override", 1000) || null,
  });
  revalidatePath("/[locale]/admin", "layout");
  redirect(reviewPage(locale, id.data, error ? `error=${encodeURIComponent(error.message.replace(/^ap: /, ""))}` : "decided=1"));
}
