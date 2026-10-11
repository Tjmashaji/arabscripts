"use client";

import { useEffect, useState } from "react";
import { BusFront, Check, KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// استعادة كلمة المرور: رابط بالبريد يعيد المستخدم للتطبيق بجلسة استعادة (type=recovery)،
// فتظهر صفحة تعيين كلمة المرور الجديدة.

// يُلتقط نوع الرابط عند تحميل الصفحة، لأن Supabase يمسح الـ hash بعد قراءة الجلسة منه.
// invite: مدير مدرسة مدعو يضع كلمة مروره لأول مرة؛ recovery: استعادة كلمة المرور.
const LINK_AT_LOAD = typeof window !== "undefined" && /type=(recovery|invite)/.test(window.location.hash + window.location.search);
export const isRecoveryLink = () => LINK_AT_LOAD;

export async function requestPasswordReset(email: string): Promise<string> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
  if (error && /rate limit|too many/i.test(error.message)) return "طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.";
  if (error) return "تعذر إرسال الرابط. تحقق من البريد وحاول مرة أخرى.";
  // نفس الرسالة سواء كان البريد مسجلًا أم لا، حتى لا تكشف الحسابات المسجلة.
  return "إن كان البريد مسجلًا لدينا فستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة. افحص البريد المزعج أيضًا.";
}

export function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());
  return <div className="forgot-box">
    <p className="eyebrow">استعادة الحساب</p>
    <h2>نسيت كلمة المرور؟</h2>
    <p className="muted-label">اكتب بريدك وسنرسل لك رابطًا لتعيين كلمة مرور جديدة.</p>
    <label>البريد الإلكتروني<input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></label>
    {message && <p className="auth-message">{message}</p>}
    <Button className="wide-action" disabled={!valid || busy} onClick={async () => { setBusy(true); setMessage(await requestPasswordReset(email)); setBusy(false); }}>{busy ? "جارٍ الإرسال…" : "إرسال رابط الاستعادة"}</Button>
    <button className="text-link" onClick={onBack}>رجوع لتسجيل الدخول</button>
  </div>;
}

export function ResetPasswordPage({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSave = password.length >= 8 && confirm === password;
  const save = async () => {
    setBusy(true); setMessage(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage({ text: /same|different/i.test(error.message) ? "كلمة المرور الجديدة يجب أن تختلف عن القديمة." : /session|expired|invalid/i.test(error.message) ? "انتهت صلاحية الرابط. اطلب رابطًا جديدًا." : "تعذر حفظ كلمة المرور. حاول مرة أخرى.", ok: false });
      return;
    }
    if (typeof window !== "undefined") window.history.replaceState(null, "", window.location.pathname);
    setMessage({ text: "تم تغيير كلمة المرور بنجاح.", ok: true });
    setTimeout(onDone, 900);
  };
  return <main dir="rtl" className="auth-page">
    <section className="auth-hero"><div className="brand-mark large"><BusFront /></div><p className="eyebrow">مساري</p><h1>تعيين كلمة مرور جديدة</h1><p>اختر كلمة مرور من 8 أحرف على الأقل.</p></section>
    <section className="auth-shell"><div className="auth-form-card">
      <div className="auth-form-head"><KeyRound /><div><p className="eyebrow">الأمان</p><h2>كلمة المرور الجديدة</h2></div></div>
      <label>كلمة المرور الجديدة<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {tooShort && <p className="muted-label">8 أحرف على الأقل.</p>}
      <label>تأكيد كلمة المرور<input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
      {mismatch && <p className="muted-label">كلمتا المرور غير متطابقتين.</p>}
      {message && <p className={`save-strip ops-message ${message.ok ? "" : "ops-error"}`}>{message.ok ? <Check /> : <X />}<span>{message.text}</span></p>}
      <Button className="wide-action" disabled={!canSave || busy} onClick={() => void save()}>{busy ? "جارٍ الحفظ…" : "حفظ كلمة المرور"}</Button>
      <button className="text-link" onClick={onCancel}>إلغاء</button>
    </div></section>
  </main>;
}

// ── الإشعارات الفورية (Web Push) ──
type PushState = "unsupported" | "ios-install" | "denied" | "off" | "on" | "busy";
const urlBase64ToUint8Array = (base64: string) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function currentPushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return isIos() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export function PushToggle({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<PushState>("busy");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    const run = async () => { const s = await currentPushState().catch(() => "unsupported" as const); if (alive) setState(s); };
    void run();
    return () => { alive = false; };
  }, []);

  const enable = async () => {
    setState("busy"); setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setState(permission === "denied" ? "denied" : "off"); return; }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const { data: key } = await supabase.rpc("push_public_key");
      if (!key) throw new Error("NO_KEY");
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key as string) }));
      const raw = sub.toJSON();
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) throw new Error("NO_SESSION");
      const { error } = await supabase.from("device_tokens").upsert({ user_id: userId, endpoint: sub.endpoint, p256dh: raw.keys?.p256dh, auth_key: raw.keys?.auth, platform: isIos() ? "ios" : /android/i.test(navigator.userAgent) ? "android" : "web" }, { onConflict: "endpoint" });
      if (error) throw error;
      await supabase.from("notification_preferences").upsert({ user_id: userId, push_enabled: true }, { onConflict: "user_id" });
      setState("on"); setMessage("تم تفعيل الإشعارات على هذا الجهاز.");
    } catch {
      setState("off"); setMessage("تعذر تفعيل الإشعارات. حاول مرة أخرى.");
    }
  };
  const disable = async () => {
    setState("busy"); setMessage("");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await supabase.from("device_tokens").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
    setState("off"); setMessage("تم إيقاف الإشعارات على هذا الجهاز.");
  };

  const hint = state === "ios-install" ? "على الآيفون: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية»، وافتح مساري من الأيقونة لتفعيل الإشعارات."
    : state === "denied" ? "الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح ثم أعد المحاولة."
    : state === "unsupported" ? "هذا المتصفح لا يدعم الإشعارات الفورية."
    : state === "on" ? "ستصلك التنبيهات حتى والتطبيق مغلق." : "فعّلها لتصلك تنبيهات الباص وصعود ابنك ووصوله حتى والتطبيق مغلق.";
  return <div className={compact ? "push-toggle compact" : "panel push-toggle"}>
    <div><strong>{state === "on" ? "الإشعارات مفعّلة" : "الإشعارات الفورية"}</strong><p>{message || hint}</p></div>
    {(state === "off" || state === "busy") && <Button size="sm" disabled={state === "busy"} onClick={() => void enable()}>{state === "busy" ? "…" : "تفعيل"}</Button>}
    {state === "on" && <Button size="sm" variant="outline" onClick={() => void disable()}>إيقاف</Button>}
  </div>;
}
