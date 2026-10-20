import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { textSettings, type PublicSettings, type TextSetting } from "@/lib/site";

export const SETTINGS_TAG = "public-settings";

// بيانات التواصل العامة (تظهر في كل صفحة): مخزّنة مؤقتًا وتُحدَّث فور تعديلها من الإعدادات.
const cachedSettings = unstable_cache(
  async (): Promise<PublicSettings> => {
    const supabase = createAnonClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false } });
    const { data } = await supabase.from("ap_platform_settings").select("key, value").in("key", Object.keys(textSettings));
    const out = Object.fromEntries(Object.keys(textSettings).map((k) => [k, ""])) as PublicSettings;
    for (const row of data ?? []) if (typeof row.value === "string") out[row.key as TextSetting] = row.value;
    return out;
  },
  ["ap-public-settings-v1"],
  { tags: [SETTINGS_TAG], revalidate: 600 },
);

export const getPublicSettings = cache(() => cachedSettings());
