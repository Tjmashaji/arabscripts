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
