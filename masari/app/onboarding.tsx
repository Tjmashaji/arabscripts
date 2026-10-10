"use client";

import { useCallback, useEffect, useState } from "react";
import { BusFront, Check, Clock3, School, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

// حساب مسجّل لكنه بلا دور معتمد بعد: إما ينتظر ربطه من المدرسة (ولي أمر/سائق)،
// أو يطلب تسجيل مدرسة جديدة ليعتمدها مدير النظام.

type PendingSchool = { id: string; name: string; status: string };
const parseLatLng = (text: string): { lat: number; lng: number } | null => {
  const parts = text.split(/[,،\s]+/).filter(Boolean).map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lat, lng] = parts;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
};

export function PendingAccount({ email, requestedRole, suspended, onSignOut, onRecheck }: { email: string; requestedRole?: string; suspended: boolean; onSignOut: () => void; onRecheck: () => Promise<void> }) {
  const [requests, setRequests] = useState<PendingSchool[]>([]);
  const [showForm, setShowForm] = useState(requestedRole === "school");
  const [form, setForm] = useState({ name: "", city: "الرياض", contact: "", phone: "", address: "", coords: "" });
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

  const point = parseLatLng(form.coords);
  const canSubmit = form.name.trim().length >= 3 && form.city.trim() && form.contact.trim() && form.phone.trim() && point;
  const submit = async () => {
    if (!point) return;
    setBusy(true); setMessage(null);
    const { data: session } = await supabase.auth.getSession();
    const { error } = await supabase.from("schools").insert({
      name: form.name.trim(), city: form.city.trim(), contact_name: form.contact.trim(), phone: form.phone.trim(),
      address: form.address.trim() || null, latitude: point.lat, longitude: point.lng,
      status: "pending", created_by: session.session?.user.id,
    });
    setBusy(false);
    if (error) { setMessage({ text: "تعذر إرسال الطلب. تحقق من البيانات وحاول مرة أخرى.", ok: false }); return; }
    setShowForm(false);
    setMessage({ text: "تم إرسال طلب تسجيل المدرسة. ستصلك الصلاحيات بعد اعتماد مدير النظام.", ok: true });
    await load();
  };
  const recheck = async () => { setBusy(true); try { await onRecheck(); } finally { setBusy(false); } };

  return <main dir="rtl" className="auth-page">
    <section className="auth-hero"><div className="brand-mark large"><BusFront /></div><p className="eyebrow">مساري</p><h1>{suspended ? "الحساب موقوف" : "حسابك بانتظار التفعيل"}</h1><p>{email}</p></section>
    <section className="auth-shell pending-shell">
      {message && <p className={`save-strip ops-message ${message.ok ? "" : "ops-error"}`}>{message.ok ? <Check /> : <X />}<span>{message.text}</span></p>}
      {suspended ? <article className="panel ops-panel"><p>تم إيقاف هذا الحساب. تواصل مع إدارة مساري لمعرفة السبب.</p></article> : <>
        {requests.length > 0 && <article className="panel ops-panel">
          <div className="panel-head"><div><p className="eyebrow">طلباتك</p><h2>تسجيل المدرسة</h2></div><Clock3 className="title-icon" /></div>
          {requests.map((r) => <div className="ops-row" key={r.id}><div><strong>{r.name}</strong><p>بانتظار اعتماد مدير النظام</p></div><Badge className="status-badge tone-1">قيد المراجعة</Badge></div>)}
        </article>}
        {requests.length === 0 && (showForm ? <article className="panel ops-panel">
          <div className="panel-head"><div><p className="eyebrow">إدارة مدرسة؟</p><h2>طلب تسجيل مدرسة</h2></div><School className="title-icon" /></div>
          <div className="driver-form route-form">
            <label>اسم المدرسة<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>المدينة<input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></label>
            <label>اسم المسؤول<input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></label>
            <label>جوال المسؤول<input value={form.phone} inputMode="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label>العنوان<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="الحي والشارع" /></label>
            <label>موقع المدرسة (من خرائط Google)<input dir="ltr" value={form.coords} onChange={(e) => setForm({ ...form, coords: e.target.value })} placeholder="24.7401, 46.8201" /></label>
          </div>
          {form.coords && !point && <p className="muted-label">الإحداثيات غير صحيحة. اضغط على موقع المدرسة في خرائط Google وانسخ الرقمين.</p>}
          <Button className="wide-action" disabled={!canSubmit || busy} onClick={() => void submit()}>{busy ? "جارٍ الإرسال…" : "إرسال طلب التسجيل"}</Button>
        </article> : <Button variant="outline" className="wide-action" onClick={() => setShowForm(true)}><School /> أنا إدارة مدرسة وأريد تسجيلها</Button>)}
        <article className="panel ops-panel">
          <div className="panel-head"><div><p className="eyebrow">{requests.length ? "بعد اعتماد المدرسة" : "ولي أمر أو سائق؟"}</p><h2>{requests.length ? "تحقق من حالة طلبك" : "تنتظر ربط حسابك من المدرسة"}</h2></div></div>
          {!requests.length && <p className="muted-label">أعطِ المدرسة بريدك <strong dir="ltr">{email}</strong> لتضيفك به. سيُفعَّل حسابك تلقائيًا عند اعتمادها لك، ثم اضغط «تحقق الآن».</p>}
          <Button variant="outline" className="wide-action" disabled={busy} onClick={() => void recheck()}>تحقق الآن</Button>
        </article>
      </>}
      <button className="text-link" onClick={onSignOut}>تسجيل الخروج</button>
    </section>
  </main>;
}

type SchoolRow = { id: string; name: string; city: string | null; contact_name: string | null; phone: string | null; status: string; latitude: number | null; created_at: string };
const statusText: Record<string, string> = { pending: "بانتظار الاعتماد", active: "نشطة", suspended: "موقوفة" };

// مدير النظام: اعتماد المدارس الجديدة وإيقافها. غير المدير يرى القائمة فقط.
export function AdminSchools({ canManage }: { canManage: boolean }) {
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("schools").select("id,name,city,contact_name,phone,status,latitude,created_at").order("created_at", { ascending: false });
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
    <div><strong>{s.name}</strong><p>{[s.city, s.contact_name, s.phone, s.latitude == null && "بلا موقع"].filter(Boolean).join(" · ")}</p></div>
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
