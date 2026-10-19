import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// عميل لإرسال روابط البريد (التفعيل واستعادة كلمة المرور) بالتدفق «implicit»:
// يصل الرابط ومعه الجلسة في جزء # من العنوان، فلا يحتاج كوكيز ولا نفس المتصفح الذي طلب الرابط،
// ولا يتأثر بطلب مكرر أو برجوع Supabase إلى Site URL. تدفق PKCE يفشل في كل هذه الحالات.
export function createEmailLinkClient() {
  return createClient(env.supabaseUrl, env.supabaseKey, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
