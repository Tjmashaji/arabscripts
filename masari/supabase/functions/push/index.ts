// إرسال إشعارات Web Push لأجهزة المستخدم عند إنشاء إشعار جديد.
// الحماية: "send" يتطلب x-push-secret المحفوظ في قاعدة البيانات (يرسله المشغّل فقط).
// "init" يولّد مفاتيح VAPID مرة واحدة داخل Supabase ويعيد المفتاح العام فقط.
// منشورة على مشروع masari باسم push (verify_jwt = false، والتحقق بالسر أعلاه).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

type Config = { hook_secret: string; vapid_public: string | null; vapid_private: string | null };

async function loadConfig(): Promise<Config> {
  const { data, error } = await admin.rpc("push_internal_config");
  if (error || !data) throw new Error("CONFIG_UNAVAILABLE");
  return data as Config;
}

async function ensureKeys(cfg: Config): Promise<Config> {
  if (cfg.vapid_public && cfg.vapid_private) return cfg;
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d!;
  await admin.rpc("push_store_keys", { p_public: publicKey, p_private: privateKey });
  return loadConfig(); // في حال سبقنا طلب آخر، نعتمد المفاتيح المحفوظة.
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  let body: { action?: string; notification_id?: string };
  try { body = await req.json(); } catch { return json({ error: "BAD_REQUEST" }, 400); }

  let cfg: Config;
  try { cfg = await loadConfig(); } catch { return json({ error: "CONFIG_UNAVAILABLE" }, 500); }

  if (body.action === "init") {
    cfg = await ensureKeys(cfg);
    return json({ public_key: cfg.vapid_public });
  }

  if (body.action !== "send") return json({ error: "UNKNOWN_ACTION" }, 400);
  if (req.headers.get("x-push-secret") !== cfg.hook_secret) return json({ error: "FORBIDDEN" }, 403);
  if (!body.notification_id) return json({ error: "BAD_REQUEST" }, 400);
  cfg = await ensureKeys(cfg);

  const { data: note } = await admin.from("notifications").select("id,user_id,type,title,body,data").eq("id", body.notification_id).single();
  if (!note) return json({ error: "NOT_FOUND" }, 404);
  const { data: tokens } = await admin.from("device_tokens").select("id,endpoint,p256dh,auth_key").eq("user_id", note.user_id);
  if (!tokens?.length) return json({ sent: 0 });

  webpush.setVapidDetails("https://hramsoavpanetdhwpokr.supabase.co", cfg.vapid_public!, cfg.vapid_private!);
  const payload = JSON.stringify({ title: note.title, body: note.body ?? "", tag: note.type, url: "/", id: note.id });
  const results = await Promise.all(tokens.map(async (t) => {
    try {
      const res = await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh!, auth: t.auth_key! } }, payload, { TTL: 3600, urgency: "high" });
      return { status: res.statusCode };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 0;
      // الاشتراك انتهى أو أُلغي من المتصفح: نحذفه حتى لا نحاول مجددًا.
      if (status === 404 || status === 410) await admin.from("device_tokens").delete().eq("id", t.id);
      return { status, error: String((e as Error).message ?? e).slice(0, 200) };
    }
  }));
  return json({ sent: results.filter((r) => r.status >= 200 && r.status < 300).length, results });
});
