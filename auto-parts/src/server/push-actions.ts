"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PUSH_COOKIE } from "@/lib/push-content";

// يربط جهاز الجوال بالحساب الحالي. الرمز يُحفظ في كوكي ليُلغى تسجيله عند الخروج.
export async function registerPushToken(token: string, platform: string): Promise<void> {
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) return;
  if (platform !== "android" && platform !== "ios") return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_register_push_token", { p_token: token, p_platform: platform });
  if (error) return;
  (await cookies()).set(PUSH_COOKIE, token, {
    path: "/", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 24 * 365,
  });
}
