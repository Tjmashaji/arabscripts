import { createClient } from "@supabase/supabase-js";
// مشروع Supabase «masari» (hramsoavpanetdhwpokr). المفتاح publishable وآمن للمتصفح؛ الحماية عبر RLS.
export const supabase = createClient("https://hramsoavpanetdhwpokr.supabase.co", "sb_publishable_GoDofl1CxajoPvU4kjlJ3w_HKVury67", { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
