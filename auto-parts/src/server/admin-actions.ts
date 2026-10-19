"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { localePath, requireStaff } from "@/lib/auth";
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
