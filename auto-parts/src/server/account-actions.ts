"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { localePath, requireSession } from "@/lib/auth";
import { formLocale, text } from "./form";

const profileSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.union([z.literal(""), z.string().regex(/^\+?[0-9 ]{6,20}$/)]),
});

export async function updateProfile(form: FormData) {
  const locale = formLocale(form);
  const session = await requireSession(locale, "/account");
  const parsed = profileSchema.safeParse({ fullName: text(form, "fullName", 120), phone: text(form, "phone", 20) });
  if (!parsed.success) redirect(`${localePath(locale, "/account")}?error=1`);

  const supabase = await createClient();
  // التحديث يمر عبر RLS: المستخدم يعدّل اسمه وجواله فقط، ولا يستطيع تعديل حالته أو صف غيره.
  const { error } = await supabase
    .from("ap_profiles")
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone || null })
    .eq("user_id", session.userId);
  redirect(`${localePath(locale, "/account")}?${error ? "error=1" : "saved=1"}`);
}

export async function updateLanguage(form: FormData) {
  const locale = formLocale(form);
  const target = formLocale(form, "preferredLocale");
  const session = await requireSession(locale, "/account");
  const supabase = await createClient();
  const { error } = await supabase.from("ap_user_preferences").update({ locale: target }).eq("user_id", session.userId);
  if (error) redirect(`${localePath(locale, "/account")}?error=1`);
  (await cookies()).set("NEXT_LOCALE", target, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect(`${localePath(target, "/account")}?saved=1`);
}

const deletionBlockers = ["staff_account", "organization_owner", "open_orders"] as const;

// حذف الحساب بطلب صاحبه: يكتب بريده للتأكيد، ثم تُحذف صور طلباته من التخزين، ثم الحساب عبر ap_delete_my_account
// (تبقى الطلبات والمدفوعات بلا هوية للسجلات). الموانع تُفحص قبل أي حذف حتى لا يُحذف جزء ويُرفض الباقي.
export async function deleteAccount(form: FormData) {
  const locale = formLocale(form);
  const page = localePath(locale, "/account");
  const session = await requireSession(locale, "/account");
  if (text(form, "confirmEmail", 320).toLowerCase() !== session.email.toLowerCase()) redirect(`${page}?delete=confirm#delete`);

  const supabase = await createClient();
  const { data: blocker, error: checkError } = await supabase.rpc("ap_account_deletion_blocker");
  if (checkError) redirect(`${page}?delete=failed#delete`);
  if (blocker) redirect(`${page}?delete=${(deletionBlockers as readonly string[]).includes(blocker) ? blocker : "failed"}#delete`);

  const { data: media, error: mediaError } = await supabase
    .from("ap_quote_request_media")
    .select("storage_path, ap_quote_requests!inner(customer_id)")
    .eq("ap_quote_requests.customer_id", session.userId);
  if (mediaError) redirect(`${page}?delete=failed#delete`);
  const paths = (media ?? []).map((m) => m.storage_path as string);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await supabase.storage.from("ap-request-media").remove(paths.slice(i, i + 100));
    if (error) redirect(`${page}?delete=failed#delete`);
  }

  const { error } = await supabase.rpc("ap_delete_my_account");
  if (error) redirect(`${page}?delete=failed#delete`);
  // الحساب حُذف من Supabase؛ نمسح كوكيز الجلسة هنا أيضًا لأن الرمز الحالي يبقى صالحًا حتى ينتهي.
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  const jar = await cookies();
  for (const c of jar.getAll()) if (c.name.startsWith("sb-")) jar.delete(c.name);
  redirect(`${localePath(locale, "/login")}?deleted=1`);
}
