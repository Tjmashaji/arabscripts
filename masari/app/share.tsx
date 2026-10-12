"use client";

import { useCallback, useEffect, useState } from "react";
import { BusFront, Copy, Link2, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { TripMap } from "./trip-map";

// رابط تتبع مؤقت: ولي الأمر يرسل رابطًا لقريب (الجد، سائق خاص…) يرى فيه الباص وحالة رحلة اليوم فقط،
// وينتهي تلقائيًا بعد المدة المختارة أو عند إيقافه.

// تطبيق الجوال يعمل من localhost، فالرابط يجب أن يشير إلى الموقع العام
const PUBLIC_SITE = "https://masari-tjmashajis-projects.vercel.app";
const siteBase = () => {
  const { protocol, hostname, origin, pathname } = window.location;
  return (protocol === "https:" || protocol === "http:") && hostname !== "localhost" && hostname !== "127.0.0.1" ? `${origin}${pathname}` : `${PUBLIC_SITE}/`;
};
export const shareTokenFromHash = () => {
  const m = typeof window === "undefined" ? null : window.location.hash.match(/^#share=([0-9a-f-]{36})$/i);
  return m ? m[1] : null;
};

type Link = { id: string; token: string; label: string | null; expires_at: string; revoked_at: string | null; student_id: string };
const fmt = (iso: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(iso));

export function ShareLinks() {
  const [kids, setKids] = useState<{ id: string; full_name: string }[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [form, setForm] = useState({ student: "", hours: 3, label: "" });
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    const [{ data: st }, { data: ln }] = await Promise.all([
      supabase.from("students").select("id,full_name").order("full_name"),
      supabase.from("trip_share_links").select("id,token,label,expires_at,revoked_at,student_id").is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
    ]);
    setKids(st ?? []); setLinks((ln ?? []) as Link[]);
  }, []);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [load]);
  const student = form.student || kids[0]?.id || "";
  const send = async (token: string, name: string) => {
    const url = `${siteBase()}#share=${token}`;
    const text = `تابع باص ${name} مباشرة عبر مساري (رابط مؤقت):`;
    try {
      if (navigator.share) { await navigator.share({ title: "مساري", text, url }); return; }
    } catch { /* أُلغيت المشاركة */ }
    try { await navigator.clipboard.writeText(`${text} ${url}`); setMsg("نُسخ الرابط. أرسله عبر واتساب أو الرسائل."); } catch { window.prompt("انسخ الرابط:", url); }
  };
  const create = async () => {
    setMsg("");
    const { data, error } = await supabase.rpc("guardian_create_share", { p_student: student, p_hours: form.hours, p_label: form.label.trim() || null });
    if (error || !data) { setMsg(error?.message.includes("TOO_MANY_LINKS") ? "لديك 5 روابط فعّالة؛ أوقف أحدها أولًا." : "تعذر إنشاء الرابط."); return; }
    setForm({ ...form, label: "" }); await load();
    await send(data as string, kids.find((k) => k.id === student)?.full_name.split(" ")[0] ?? "");
  };
  const revoke = async (id: string) => { await supabase.rpc("guardian_revoke_share", { p_id: id }); setMsg("أُوقف الرابط ولم يعد يعمل."); await load(); };
  if (!kids.length) return null;
  return <article className="panel ops-panel share-panel">
    <div className="panel-head"><div><p className="eyebrow">مشاركة مؤقتة</p><h2>رابط تتبع لقريب</h2></div><Share2 className="title-icon" /></div>
    <p className="muted-label">يرى صاحب الرابط موقع الباص وحالة رحلة اليوم فقط، دون عنوان البيت أو بيانات أخرى، وينتهي تلقائيًا.</p>
    <div className="driver-form share-form">
      {kids.length > 1 && <label>الطالب<select value={student} onChange={(e) => setForm({ ...form, student: e.target.value })}>{kids.map((k) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select></label>}
      <label>المدة<select value={form.hours} onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}>{[1, 3, 6, 12, 24].map((h) => <option key={h} value={h}>{h === 1 ? "ساعة" : h === 24 ? "يوم كامل" : `${h} ساعات`}</option>)}</select></label>
      <label>لمن؟ (اختياري)<input value={form.label} maxLength={40} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="مثال: الجدة" /></label>
      <Button disabled={!student} onClick={() => void create()}><Link2 /> إنشاء وإرسال الرابط</Button>
    </div>
    {links.map((l) => <div className="ops-row" key={l.id}><div><strong>{l.label || "رابط"} · {kids.find((k) => k.id === l.student_id)?.full_name ?? ""}</strong><p>ينتهي {fmt(l.expires_at)}</p></div>
      <div className="ops-actions"><Button size="sm" variant="outline" onClick={() => void send(l.token, kids.find((k) => k.id === l.student_id)?.full_name.split(" ")[0] ?? "")}><Copy /> إرسال</Button>
        <Button size="sm" variant="outline" onClick={() => void revoke(l.id)}><X /> إيقاف</Button></div></div>)}
    {msg && <p className="muted-label">{msg}</p>}
  </article>;
}

type Shared = { ok: boolean; student?: string; school?: string; school_lat?: number | null; school_lng?: number | null; expires_at?: string; trip_status?: string | null; direction?: string | null; student_status?: string | null; route?: string | null; bus_lat?: number | null; bus_lng?: number | null; bus_at?: string | null };
const studentText: Record<string, string> = { not_boarded: "لم يركب بعد", waiting: "بانتظار الباص", boarded: "ركب الباص", arrived_school: "وصل المدرسة", absent: "غائب اليوم", boarded_return: "ركب باص العودة", dropped_home: "نزل عند البيت", no_show: "لم يحضر", emergency: "حالة طارئة — تواصل مع المدرسة" };
const tripText: Record<string, string> = { scheduled: "الرحلة لم تبدأ بعد", ready: "الرحلة لم تبدأ بعد", in_progress: "الباص في الطريق", paused: "الرحلة متوقفة مؤقتًا", completed: "انتهت الرحلة", cancelled: "أُلغيت الرحلة", emergency: "حالة طارئة" };

export function SharedTripPage({ token, onClose }: { token: string; onClose: () => void }) {
  const [d, setD] = useState<Shared | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = () => void supabase.rpc("shared_trip", { p_token: token }).then(({ data }) => { if (alive) setD((data ?? { ok: false }) as Shared); });
    tick();
    const t = window.setInterval(tick, 15000);
    return () => { alive = false; window.clearInterval(t); };
  }, [token]);
  const bus = d?.bus_lat != null && d.bus_lng != null ? { lat: d.bus_lat, lng: d.bus_lng } : null;
  const school = d?.school_lat != null && d.school_lng != null ? { lat: d.school_lat, lng: d.school_lng, label: d.school ?? "المدرسة" } : null;
  return <main dir="rtl" className="auth-page shared-trip">
    <section className="auth-card">
      <div className="auth-brand"><div className="brand-mark"><BusFront /></div><div><strong>مساري</strong><span>تتبع مؤقت</span></div></div>
      {!d && <p className="muted-label">جارٍ التحميل…</p>}
      {d && !d.ok && <><h1>الرابط منتهي أو غير صحيح</h1><p className="muted-label">اطلب من ولي الأمر رابطًا جديدًا.</p></>}
      {d?.ok && <>
        <h1>باص {d.student}</h1>
        <p className="muted-label">{d.school}{d.route ? ` · ${d.route}` : ""}</p>
        <div className="shared-status"><strong>{d.trip_status ? tripText[d.trip_status] ?? d.trip_status : "لا رحلة اليوم"}</strong>{d.student_status && <span>{studentText[d.student_status] ?? d.student_status}</span>}</div>
        {(bus || school) && <TripMap stops={[]} school={school} bus={bus} follow={Boolean(bus)} className="shared-map" />}
        {d.bus_at && <p className="muted-label">آخر تحديث للموقع {fmt(d.bus_at)}</p>}
        <p className="muted-label">ينتهي الرابط {d.expires_at ? fmt(d.expires_at) : ""}</p>
      </>}
      <button className="text-link" onClick={onClose}>فتح مساري</button>
    </section>
  </main>;
}
