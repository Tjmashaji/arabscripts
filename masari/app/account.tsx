"use client";

import { useState } from "react";
import { BusFront, Check, KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// استعادة كلمة المرور: رابط بالبريد يعيد المستخدم للتطبيق بجلسة استعادة (type=recovery)،
// فتظهر صفحة تعيين كلمة المرور الجديدة.

export const isRecoveryLink = () => typeof window !== "undefined" && /type=recovery/.test(window.location.hash + window.location.search);

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
