"use client";
/* eslint-disable @next/next/no-img-element -- موقع ثابت: معاينة الشعار المحلية وصور التخزين لا تمر عبر next/image */

import { useCallback, useEffect, useState } from "react";
import { BusFront, Check, Clock3, School, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { SchoolRegistrationForm } from "./school-form";

// حساب مسجّل لكنه بلا دور معتمد بعد: إما ينتظر ربطه من المدرسة (ولي أمر/سائق)،
// أو يطلب تسجيل مدرسة جديدة ليعتمدها مدير النظام.

type PendingSchool = { id: string; name: string; status: string };

export function PendingAccount({ email, requestedRole, suspended, onSignOut, onRecheck }: { email: string; requestedRole?: string; suspended: boolean; onSignOut: () => void; onRecheck: () => Promise<void> }) {
  const [requests, setRequests] = useState<PendingSchool[] | null>(null);
  const [showForm, setShowForm] = useState(requestedRole === "school");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("my_access");
    setRequests(((data as { pending_school_requests?: PendingSchool[] } | null)?.pending_school_requests) ?? []);
  }, []);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [load]);
  const recheck = async () => { setBusy(true); try { await onRecheck(); } finally { setBusy(false); } };

  // نموذج تسجيل المدرسة الكامل كصفحة مستقلة
  if (!suspended && showForm && requests && requests.length === 0) return <main dir="rtl" className="sf-page">
    <header className="sf-top"><span className="lp-brand"><span className="brand-mark"><BusFront /></span><strong>مساري</strong></span><span className="sf-top-email" dir="ltr">{email}</span><button className="text-link" onClick={onSignOut}>تسجيل الخروج</button></header>
    <SchoolRegistrationForm defaultEmail={email} onSubmitted={() => { setShowForm(false); setMessage({ text: "تم إرسال طلب تسجيل المدرسة. سنراجعه ويُفعَّل حسابك بعد الاعتماد.", ok: true }); void load(); }} />
    <button className="text-link sf-back" onClick={() => setShowForm(false)}>لست إدارة مدرسة؟ رجوع</button>
  </main>;

  return <main dir="rtl" className="auth-page">
    <section className="auth-hero"><div className="brand-mark large"><BusFront /></div><p className="eyebrow">مساري</p><h1>{suspended ? "الحساب موقوف" : "حسابك بانتظار التفعيل"}</h1><p>{email}</p></section>
    <section className="auth-shell pending-shell">
      {message && <p className={`save-strip ops-message ${message.ok ? "" : "ops-error"}`}>{message.ok ? <Check /> : <X />}<span>{message.text}</span></p>}
      {suspended ? <article className="panel ops-panel"><p>تم إيقاف هذا الحساب. تواصل مع إدارة مساري لمعرفة السبب.</p></article> : <>
        {requests && requests.length > 0 && <article className="panel ops-panel">
          <div className="panel-head"><div><p className="eyebrow">طلباتك</p><h2>تسجيل المدرسة</h2></div><Clock3 className="title-icon" /></div>
          {requests.map((r) => <div className="ops-row" key={r.id}><div><strong>{r.name}</strong><p>بانتظار اعتماد مدير النظام</p></div><Badge className="status-badge tone-1">قيد المراجعة</Badge></div>)}
        </article>}
        {requests && requests.length === 0 && <Button variant="outline" className="wide-action" onClick={() => setShowForm(true)}><School /> أنا إدارة مدرسة وأريد تسجيلها</Button>}
        <article className="panel ops-panel">
          <div className="panel-head"><div><p className="eyebrow">{requests?.length ? "بعد اعتماد المدرسة" : "ولي أمر أو سائق؟"}</p><h2>{requests?.length ? "تحقق من حالة طلبك" : "تنتظر ربط حسابك من المدرسة"}</h2></div></div>
          {!requests?.length && <p className="muted-label">أعطِ المدرسة بريدك <strong dir="ltr">{email}</strong> لتضيفك به. سيُفعَّل حسابك تلقائيًا عند اعتمادها لك، ثم اضغط «تحقق الآن».</p>}
          <Button variant="outline" className="wide-action" disabled={busy} onClick={() => void recheck()}>تحقق الآن</Button>
        </article>
      </>}
      <button className="text-link" onClick={onSignOut}>تسجيل الخروج</button>
    </section>
  </main>;
}

type SchoolRow = { id: string; name: string; name_en: string | null; city: string | null; contact_name: string | null; phone: string | null; email: string | null; description: string | null; logo_url: string | null; status: string; latitude: number | null; longitude: number | null; created_at: string };
const statusText: Record<string, string> = { pending: "بانتظار الاعتماد", active: "نشطة", suspended: "موقوفة" };

// مدير النظام: اعتماد المدارس الجديدة وإيقافها. غير المدير يرى القائمة فقط.
export function AdminSchools({ canManage }: { canManage: boolean }) {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("schools").select("id,name,name_en,city,contact_name,phone,email,description,logo_url,status,latitude,longitude,created_at").order("created_at", { ascending: false });
    setSchools(data ?? []);
  }, []);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [load]);
  const setStatus = async (school: SchoolRow, status: "active" | "suspended") => {
    let note: string | null = null;
    if (status === "suspended") { note = window.prompt(`سبب إيقاف ${school.name}:`); if (!note?.trim()) return; }
    setBusy(true); setMessage(null);
    const { error } = await supabase.rpc("admin_set_school_status", { p_school: school.id, p_status: status, p_note: note });
    if (error) setMessage({ text: error.message.includes("FORBIDDEN") ? "هذا الإجراء لمدير النظام فقط." : "تعذر تحديث حالة المدرسة.", ok: false });
    else { await load(); setMessage({ text: status === "active" ? `تم اعتماد ${school.name} وتفعيل حساب مسؤولها.` : `تم إيقاف ${school.name}.`, ok: true }); }
    setBusy(false);
  };
  const pending = schools.filter((s) => s.status === "pending");
  const others = schools.filter((s) => s.status !== "pending");
  const row = (s: SchoolRow) => <div className="ops-row" key={s.id}>
    <div className="admin-school">{s.logo_url ? <img src={s.logo_url} alt="" className="admin-logo" /> : <span className="admin-logo empty"><School /></span>}<div><strong>{s.name}{s.name_en && <small dir="ltr"> · {s.name_en}</small>}</strong><p>{[s.city, s.contact_name, s.phone, s.email, s.latitude == null && "بلا موقع"].filter(Boolean).join(" · ")}</p>{s.description && <p className="admin-desc">{s.description}</p>}{s.latitude != null && s.longitude != null && <a className="text-link" href={`https://www.google.com/maps?q=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer">الموقع على الخريطة</a>}</div></div>
    <div className="ops-actions">
      <Badge className={`status-badge ${s.status === "active" ? "tone-0" : "tone-1"}`}>{statusText[s.status] ?? s.status}</Badge>
      {canManage && s.status !== "active" && <Button size="sm" disabled={busy} onClick={() => void setStatus(s, "active")}>{s.status === "pending" ? "اعتماد" : "إعادة تفعيل"}</Button>}
      {canManage && s.status === "active" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void setStatus(s, "suspended")}>إيقاف</Button>}
    </div>
  </div>;
  return <>
    <div className="welcome"><div><p className="eyebrow">إدارة النظام</p><h1>المدارس</h1><p>{canManage ? "اعتماد طلبات تسجيل المدارس الجديدة وإدارة حالتها." : "عرض المدارس. الاعتماد والإيقاف لمدير النظام فقط."}</p></div></div>
    {message && <p className={`save-strip ops-message ${message.ok ? "" : "ops-error"}`}>{message.ok ? <Check /> : <X />}<span>{message.text}</span></p>}
    <article className="panel ops-panel"><div className="panel-head"><div><p className="eyebrow">بانتظار الاعتماد</p><h2>طلبات التسجيل ({pending.length})</h2></div></div>
      {pending.length === 0 ? <p className="muted-label">لا توجد طلبات جديدة.</p> : pending.map(row)}</article>
    <article className="panel ops-panel"><div className="panel-head"><div><p className="eyebrow">كل المدارس</p><h2>المدارس المسجلة ({others.length})</h2></div></div>
      {others.length === 0 ? <p className="muted-label">لا توجد مدارس معتمدة بعد.</p> : others.map(row)}</article>
  </>;
}
