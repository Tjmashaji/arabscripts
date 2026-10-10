import { createClient } from "@supabase/supabase-js";
export const supabase = createClient("https://marqqtwxshinjbceokty.supabase.co", "sb_publishable_LYjXaMLOECVfbUm_Hzs2bQ_SVzyAGel", { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
