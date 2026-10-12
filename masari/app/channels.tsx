"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Smartphone } from "lucide-react";
import { supabase } from "@/lib/supabase";

// رسائل SMS وواتساب لأهم التنبيهات (الصعود والوصول والنزول واقتراب الباص والطوارئ) لمن لا يفتح التطبيق.

export function MessageChannels() {
  const [prefs, setPrefs] = useState<{ sms_enabled: boolean; whatsapp_enabled: boolean } | null>(null);
  const [phone, setPhone] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: s } = await supabase.auth.getSession(); const id = s.session?.user.id; if (!id || !alive) return;
      const [{ data: p }, { data: pr }] = await Promise.all([
        supabase.from("notification_preferences").select("sms_enabled,whatsapp_enabled").eq("user_id", id).maybeSingle(),
        supabase.from("profiles").select("phone").eq("user_id", id).maybeSingle(),
      ]);
      if (!alive) return;
      setUid(id); setPrefs({ sms_enabled: Boolean(p?.sms_enabled), whatsapp_enabled: Boolean(p?.whatsapp_enabled) }); setPhone(pr?.phone ?? "");
    })().catch(() => {});
    return () => { alive = false; };
  }, []);
  const save = async (next: { sms_enabled: boolean; whatsapp_enabled: boolean }) => {
    if (!uid) return;
    setMsg("");
    if ((next.sms_enabled || next.whatsapp_enabled) && !/^\+?[0-9 -]{9,16}$/.test(phone.trim())) { setMsg("اكتب رقم جوالك أولًا."); return; }
    const { error: e1 } = await supabase.rpc("set_my_phone", { p_phone: phone.trim() || null });
    const { error: e2 } = await supabase.from("notification_preferences").upsert({ user_id: uid, ...next });
    if (e1 || e2) { setMsg("تعذر الحفظ."); return; }
    setPrefs(next); setMsg(next.sms_enabled || next.whatsapp_enabled ? "سيصلك أهم التنبيهات برسالة على جوالك." : "أوقفت الرسائل.");
  };
  if (!prefs) return null;
  return <div className="channels">
    <p className="channels-title">رسائل على الجوال لأهم التنبيهات</p>
    <input dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxx" aria-label="رقم الجوال" inputMode="tel" />
    <div className="channels-toggles">
      <label htmlFor="ch-sms"><input id="ch-sms" type="checkbox" checked={prefs.sms_enabled} onChange={(e) => void save({ ...prefs, sms_enabled: e.target.checked })} /><Smartphone /> رسالة SMS</label>
      <label htmlFor="ch-wa"><input id="ch-wa" type="checkbox" checked={prefs.whatsapp_enabled} onChange={(e) => void save({ ...prefs, whatsapp_enabled: e.target.checked })} /><MessageSquare /> واتساب</label>
    </div>
    {msg && <small>{msg}</small>}
  </div>;
}

type Stat = { channel: string; status: string; n: number; last_error: string | null };
const statusText: Record<string, string> = { queued: "بالانتظار", sending: "قيد الإرسال", sent: "أُرسلت", failed: "فشلت", no_provider: "لم يُضبط مزوّد" };
export function MessageStats() {
  const [rows, setRows] = useState<Stat[] | null>(null);
  useEffect(() => { let alive = true; void supabase.rpc("admin_message_stats").then(({ data }) => { if (alive) setRows((data ?? []) as Stat[]); }); return () => { alive = false; }; }, []);
  if (!rows) return null;
  const noProvider = rows.some((r) => r.status === "no_provider");
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">آخر 30 يومًا</p><h2>رسائل SMS وواتساب</h2></div><MessageSquare className="title-icon" /></div>
    {rows.length === 0 && <p className="muted-label">لم تُرسل رسائل بعد. تُرسل فقط لمن فعّلها من الإشعارات.</p>}
    {noProvider && <p className="save-strip ops-message ops-error"><span>لم يُضبط مزوّد الرسائل. أضف أسرار Twilio أو Unifonic في Supabase ← Edge Functions ← Secrets.</span></p>}
    {rows.map((r) => <div className="ops-row" key={`${r.channel}-${r.status}`}><div><strong>{r.channel === "sms" ? "SMS" : "واتساب"} · {statusText[r.status] ?? r.status}</strong>{r.last_error && <p dir="ltr">{r.last_error}</p>}</div><strong>{r.n}</strong></div>)}
  </article>;
}
