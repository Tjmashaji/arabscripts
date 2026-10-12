// تفعيل مدرسة ودعوة مديرها: يُستدعى من لوحة الإدارة بجلسة المستخدم.
// الصلاحية تتحقق منها activate_school (مدير النظام أو الإدارة التنفيذية فقط).
// إن لم يكن صاحب البريد مسجلًا تُرسل له دعوة بالبريد ليضع كلمة مروره، ثم يُربط تلقائيًا عند دخوله.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
// رابط العودة من بريد الدعوة: موقع مساري فقط (يمنع توجيه المدعو إلى موقع آخر)
const PUBLIC_SITE = "https://masari-tjmashajis-projects.vercel.app";
const safeRedirect = (v: unknown) => typeof v === "string" && /^https:\/\/masari[a-z0-9-]*-tjmashajis-projects\.vercel\.app\/?$/.test(v) ? v : PUBLIC_SITE;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "NOT_AUTHENTICATED" }, 401);
  let body: { school_id?: string; email?: string; redirect_to?: string };
  try { body = await req.json(); } catch { return json({ error: "BAD_REQUEST" }, 400); }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!body.school_id || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "BAD_REQUEST" }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: result, error } = await asUser.rpc("activate_school", { p_school: body.school_id, p_admin_email: email });
  if (error) return json({ error: /^[A-Z_]+$/.test(error.message) ? error.message : "ACTIVATION_FAILED" }, error.code === "42501" ? 403 : 400);

  const activated = result as { user_exists?: boolean; linked_now?: boolean; notified?: number };
  let inviteSent = false; let inviteNote: string | null = null;
  if (!activated.user_exists) {
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: safeRedirect(body.redirect_to),
      data: { requested_role: "school" },
    });
    if (inviteError) inviteNote = /registered|exists/i.test(inviteError.message) ? "ALREADY_REGISTERED_UNCONFIRMED" : "INVITE_FAILED";
    else inviteSent = true;
  }
  return json({ ...activated, invite_sent: inviteSent, invite_note: inviteNote });
});
