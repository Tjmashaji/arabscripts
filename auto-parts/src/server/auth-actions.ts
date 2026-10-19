"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { AuthError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createEmailLinkClient } from "@/lib/supabase/implicit";
import { isRecoveryToken } from "@/lib/auth-callback";
import { env } from "@/lib/env";
import { localePath } from "@/lib/auth";
import { safeNextPath, stripLocalePrefix } from "@/lib/safe-redirect";
import { isLocale, locales } from "@/i18n/locales";
import { formLocale, text } from "./form";

type AuthErrorKey = "invalid" | "notConfirmed" | "weakPassword" | "invalidEmail" | "nameRequired" | "rateLimited" | "generic";

function authErrorKey(error: AuthError): AuthErrorKey {
  switch (error.code) {
    case "invalid_credentials":
      return "invalid";
    case "email_not_confirmed":
      return "notConfirmed";
    case "weak_password":
      return "weakPassword";
    case "email_address_invalid":
      return "invalidEmail";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rateLimited";
    default:
      return "generic";
  }
}

function back(locale: string, page: "/login" | "/signup", error: AuthErrorKey, next: string): never {
  redirect(`${localePath(locale, page)}?error=${error}&next=${encodeURIComponent(next)}`);
}

const credentials = z.object({ email: z.email().max(254), password: z.string().min(8).max(72) });

export async function signIn(form: FormData) {
  const locale = formLocale(form);
  const next = safeNextPath(text(form, "next", 512));
  const parsed = credentials.safeParse({ email: text(form, "email", 254), password: form.get("password") });
  if (!parsed.success) back(locale, "/login", "invalid", next);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) back(locale, "/login", authErrorKey(error), next);

  // يُفتح الحساب بلغته المفضلة المحفوظة، لا بلغة الصفحة التي سجّل منها.
  await supabase.rpc("ap_ensure_profile", { p_full_name: null, p_locale: locale });
  const { data: prefs } = await supabase.from("ap_user_preferences").select("locale").maybeSingle();
  const target = isLocale(prefs?.locale) ? prefs.locale : locale;
  (await cookies()).set("NEXT_LOCALE", target, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect(localePath(target, stripLocalePrefix(next, locales)));
}

const signUpSchema = credentials.extend({ fullName: z.string().min(1).max(120) });

export async function signUp(form: FormData) {
  const locale = formLocale(form);
  const preferred = formLocale(form, "preferredLocale");
  const next = safeNextPath(text(form, "next", 512));
  const parsed = signUpSchema.safeParse({
    email: text(form, "email", 254),
    password: form.get("password"),
    fullName: text(form, "fullName", 120),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    back(locale, "/signup", field === "fullName" ? "nameRequired" : field === "password" ? "weakPassword" : "invalidEmail", next);
  }

  const { error } = await createEmailLinkClient().auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    // لا نضع "role" في البيانات الوصفية: مشغّل تطبيق آخر في نفس المشروع يقرؤها.
    options: { data: { full_name: parsed.data.fullName, locale: preferred, app: "auto_parts" }, emailRedirectTo: `${env.siteUrl}/auth/confirm` },
  });
  if (error) back(locale, "/signup", authErrorKey(error), next);

  // بعد تفعيل البريد يعود المستخدم للصفحة التي جاء منها (مثل رابط دعوة شريك).
  const afterConfirm = stripLocalePrefix(next, locales);
  if (afterConfirm !== "/account") {
    (await cookies()).set("ap_after_confirm", afterConfirm, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 });
  }
  // نفس الرسالة سواء كان البريد مسجلًا من قبل أم لا، حتى لا تكشف الصفحة من لديه حساب.
  redirect(`${localePath(locale, "/signup")}?sent=1`);
}

export async function signOut(form: FormData) {
  const locale = formLocale(form);
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(localePath(locale, "/"));
}

// مبدّل اللغة: يغيّر رابط الصفحة، ويحفظ اللغة في حساب المستخدم إن كان مسجلًا.
export async function switchLocale(form: FormData) {
  const target = formLocale(form, "target");
  const path = stripLocalePrefix(safeNextPath(text(form, "path", 512), "/"), locales);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user && !data.user.is_anonymous) {
    await supabase.from("ap_user_preferences").update({ locale: target }).eq("user_id", data.user.id);
  }
  (await cookies()).set("NEXT_LOCALE", target, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect(localePath(target, path));
}

// يرسل رابط تعيين كلمة مرور جديدة. النتيجة نفسها دائمًا حتى لا تكشف الصفحة أي بريد مسجّل.
export async function requestPasswordReset(form: FormData) {
  const locale = formLocale(form);
  const email = z.email().max(254).safeParse(text(form, "email", 254));
  if (!email.success) redirect(`${localePath(locale, "/forgot-password")}?error=invalidEmail`);

  const { error } = await createEmailLinkClient().auth.resetPasswordForEmail(email.data, {
    redirectTo: `${env.siteUrl}/auth/confirm`,
  });
  if (error && authErrorKey(error) === "rateLimited") redirect(`${localePath(locale, "/forgot-password")}?error=rateLimited`);
  redirect(`${localePath(locale, "/forgot-password")}?sent=1`);
}

const newPasswordSchema = z
  .object({ password: z.string().min(8).max(72), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

// يعمل فقط بجلسة فتحها رابط الاستعادة (أو جلسة دخول عادية).
export async function updatePassword(form: FormData) {
  const locale = formLocale(form);
  const page = localePath(locale, "/reset-password");
  const parsed = newPasswordSchema.safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) {
    redirect(`${page}?error=${parsed.error.issues[0]?.path[0] === "confirm" ? "mismatch" : "weakPassword"}`);
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`${localePath(locale, "/login")}?next=${encodeURIComponent("/reset-password")}`);
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) redirect(`${page}?error=${error.code === "same_password" ? "samePassword" : authErrorKey(error)}`);
  redirect(`${localePath(locale, "/account")}?password=1`);
}

const emailLinkSchema = z.object({
  accessToken: z.string().min(20).max(4096),
  refreshToken: z.string().min(1).max(512),
  type: z.string().max(32).nullable(),
  locale: z.string().max(8),
});

// يحوّل رمز رابط البريد (تدفق implicit) إلى جلسة بكوكيز الخادم. Supabase يتحقق من الرمز قبل قبوله.
export async function completeEmailLink(input: z.input<typeof emailLinkSchema>): Promise<string> {
  const parsed = emailLinkSchema.safeParse(input);
  const locale = isLocale(parsed.data?.locale) ? parsed.data.locale : "ar";
  const failed = `${localePath(locale, "/login")}?error=confirmFailed`;
  if (!parsed.success) return failed;

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token: parsed.data.accessToken,
    refresh_token: parsed.data.refreshToken,
  });
  if (error) return failed;
  const recovery = parsed.data.type === "recovery" || isRecoveryToken(parsed.data.accessToken);
  if (recovery) return `${localePath(locale, "/reset-password")}?confirmed=1`;
  const jar = await cookies();
  const after = safeNextPath(jar.get("ap_after_confirm")?.value, "/account");
  jar.delete("ap_after_confirm");
  return `${localePath(locale, after)}${after.includes("?") ? "&" : "?"}confirmed=1`;
}
