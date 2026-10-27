"use server";

import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { aiConfigured, runAiFill, type AiFillResult } from "@/lib/ai-fill";
import { AI_MAX_FILE_BYTES, AI_MAX_TEXT, cleanOptions, isAiProfile } from "@/lib/ai-fill-profiles";
import { formLocale } from "./form";

export type AiFillResponse = AiFillResult | { ok: false; error: "auth" | "off" | "quota" };

// مساعد التعبئة: يقرأ ما لصقه المستخدم أو رفعه ويقترح قيم الحقول. لا يحفظ شيئًا؛ المستخدم يراجع ثم يحفظ النموذج بنفسه.
export async function aiFill(form: FormData): Promise<AiFillResponse> {
  const profile = form.get("profile");
  if (!isAiProfile(profile)) return { ok: false, error: "failed" };
  if (!aiConfigured()) return { ok: false, error: "off" };
  const session = await getSession();
  if (!session || session.status !== "active") return { ok: false, error: "auth" };

  const raw = form.get("text");
  const text = typeof raw === "string" ? raw.trim().slice(0, AI_MAX_TEXT) : "";
  const upload = form.get("file");
  const file = upload instanceof File && upload.size > 0 ? upload : null;
  if (file && file.size > AI_MAX_FILE_BYTES) return { ok: false, error: "file" };
  if (!text && !file) return { ok: false, error: "empty" };
  let options: unknown = null;
  try {
    const o = form.get("options");
    options = typeof o === "string" && o.length <= 60_000 ? JSON.parse(o) : null;
  } catch {
    options = null;
  }

  // الحصة تُحجز قبل الاتصال بالنموذج حتى لا تُتجاوز بطلبات متوازية.
  const supabase = await createClient();
  const { data: allowed, error } = await supabase.rpc("ap_ai_quota_take", { p_kind: profile });
  if (error) return { ok: false, error: "failed" };
  if (!allowed) return { ok: false, error: "quota" };

  return runAiFill({
    profile, locale: formLocale(form), text,
    file: file ? new Uint8Array(await file.arrayBuffer()) : null,
    options: cleanOptions(profile, options),
  });
}
