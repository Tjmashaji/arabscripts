"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CalendarClock, Check, Hand, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

// «نداء البوابة» و«التصاريح»: ولي الأمر يعلن وصوله للبوابة، ويصرّح بغياب أو استلام بنفسه أو خروج مبكر.

const riyadhDate = (offsetDays = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date(Date.now() + offsetDays * 86400000));
const timeOf = (iso: string) => new Intl.DateTimeFormat("ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(iso));
const KINDS: Record<string, { label: string; hint: string }> = {
  absence: { label: "غياب", hint: "لن يمر الباص على ابنك في الذهاب والعودة." },
  self_pickup: { label: "سأستلمه بنفسي", hint: "لن يركب ابنك باص العودة." },
  early_leave: { label: "خروج مبكر", hint: "تُبلَّغ المدرسة بالوقت، ولن يركب باص العودة." },
};
const one = <T,>(v: T | T[] | null): T | null => Array.isArray(v) ? v[0] ?? null : v;

type Kid = { id: string; full_name: string };
type Call = { id: string; student_id: string; status: string; note: string | null; created_at: string; released_at: string | null };
type Perm = { id: string; student_id: string; kind: string; from_date: string; to_date: string; leave_time: string | null; note: string | null; status: string };

// ───────── ولي الأمر ─────────
export function ParentGate() {
  const [kids, setKids] = useState<Kid[] | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [form, setForm] = useState({ student: "", kind: "absence", from: riyadhDate(), to: riyadhDate(), time: "", note: "" });
  const load = useCallback(async () => {
    const [{ data: k }, { data: c }, { data: p }] = await Promise.all([
      supabase.from("students").select("id,full_name").order("full_name"),
      supabase.from("pickup_calls").select("id,student_id,status,note,created_at,released_at").eq("call_date", riyadhDate()).order("created_at", { ascending: false }),
      supabase.from("student_permissions").select("id,student_id,kind,from_date,to_date,leave_time,note,status").eq("status", "active").gte("to_date", riyadhDate()).order("from_date"),
    ]);
    setKids((k ?? []) as Kid[]); setCalls((c ?? []) as Call[]); setPerms((p ?? []) as Perm[]);
    setForm((f) => f.student || !k?.[0] ? f : { ...f, student: k[0].id });
  }, []);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => setKids([])); };
    void run(); const t = window.setInterval(() => void run(), 15000);
    return () => { alive = false; window.clearInterval(t); };
  }, [load]);
  const nameOf = (id: string) => kids?.find((k) => k.id === id)?.full_name ?? "ابنك";
  const callFor = async (kid: Kid) => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("pickup_calls").insert({ student_id: kid.id, note: note.trim() || null });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message.includes("pickup_calls_one_waiting") || error.message.includes("duplicate") ? `نداء ${kid.full_name} مرسل بالفعل.` : "تعذر إرسال النداء. حاول مرة أخرى." }); return; }
    setMsg({ ok: true, text: `أبلغنا المدرسة أنك عند البوابة. سيُسلَّم ${kid.full_name} إليك.` }); await load();
  };
  const cancelCall = async (c: Call) => { await supabase.rpc("update_pickup_call", { p_call: c.id, p_status: "cancelled" }); await load(); };
  const addPerm = async () => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("student_permissions").insert({ student_id: form.student, kind: form.kind, from_date: form.from, to_date: form.kind === "early_leave" ? form.from : form.to, leave_time: form.kind === "early_leave" && form.time ? form.time : null, note: form.note.trim() || null });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message.includes("check") ? "تأكد من التواريخ: من اليوم فصاعدًا، والمدة 60 يومًا كحد أقصى." : "تعذر حفظ التصريح. حاول مرة أخرى." }); return; }
    setMsg({ ok: true, text: `أُرسل التصريح للمدرسة: ${KINDS[form.kind].label} لـ${nameOf(form.student)}.` });
    setForm((f) => ({ ...f, note: "", time: "" })); await load();
  };
  const cancelPerm = async (p: Perm) => { await supabase.rpc("cancel_student_permission", { p_id: p.id }); await load(); };
  const validPerm = !!form.student && form.from >= riyadhDate() && (form.kind === "early_leave" ? !!form.time : form.to >= form.from);
  return <>
    <div className="welcome"><div><p className="eyebrow">ولي الأمر</p><h1>النداء والتصاريح</h1><p>أعلن وصولك لبوابة المدرسة، أو صرّح بغياب ابنك أو استلامه بنفسك.</p></div></div>
    {msg && <p className={`save-strip ops-message ${msg.ok ? "" : "ops-error"}`}>{msg.ok ? <Check /> : <X />}<span>{msg.text}</span></p>}
    {kids && kids.length === 0 && <article className="panel ops-panel"><p className="muted-label">لا يوجد أبناء مرتبطون بحسابك بعد.</p></article>}
    {!!kids?.length && <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">نداء البوابة</p><h2>وصلت المدرسة لاستلام ابنك؟</h2></div><Hand className="title-icon" /></div>
      <label htmlFor="gate-note">ملاحظة للمدرسة (اختياري)<input id="gate-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="مثال: سيارة بيضاء عند البوابة الشمالية" /></label>
      <div className="gate-kids">{kids.map((k) => {
        const c = calls.find((x) => x.student_id === k.id && x.status !== "cancelled");
        return <div className="gate-kid" key={k.id}><strong>{k.full_name}</strong>
          {c?.status === "waiting" ? <><Badge className="status-badge tone-1">بانتظار التسليم منذ {timeOf(c.created_at)}</Badge><Button size="sm" variant="outline" onClick={() => void cancelCall(c)}>إلغاء النداء</Button></>
            : c?.status === "released" ? <Badge className="status-badge tone-0">سُلّم الساعة {timeOf(c.released_at ?? c.created_at)}</Badge>
            : <Button className="gate-call" disabled={busy} onClick={() => void callFor(k)}><Bell /> أنا عند البوابة</Button>}
        </div>;
      })}</div>
    </article>}
    {!!kids?.length && <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">التصاريح</p><h2>تصريح جديد</h2></div><CalendarClock className="title-icon" /></div>
      <div className="claim-grid">
        <label htmlFor="pm-kid">الابن<select id="pm-kid" value={form.student} onChange={(e) => setForm({ ...form, student: e.target.value })}>{kids.map((k) => <option key={k.id} value={k.id}>{k.full_name}</option>)}</select></label>
        <label htmlFor="pm-kind">النوع<select id="pm-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(KINDS).map(([v, k]) => <option key={v} value={v}>{k.label}</option>)}</select></label>
        <label htmlFor="pm-from">{form.kind === "early_leave" ? "اليوم" : "من"}<input id="pm-from" type="date" min={riyadhDate()} value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: e.target.value > form.to ? e.target.value : form.to })} /></label>
        {form.kind === "early_leave" ? <label htmlFor="pm-time">وقت الخروج<input id="pm-time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
          : <label htmlFor="pm-to">إلى<input id="pm-to" type="date" min={form.from} value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>}
        <label htmlFor="pm-note" className="wide">ملاحظة (اختياري)<input id="pm-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={300} /></label>
      </div>
      <p className="muted-label">{KINDS[form.kind].hint}</p>
      <div className="ops-actions"><Button disabled={busy || !validPerm} onClick={() => void addPerm()}>إرسال التصريح</Button></div>
      {perms.length > 0 && <div className="perm-list"><p className="field-title">التصاريح القادمة</p>{perms.map((p) => <div className="ops-row" key={p.id}>
        <div><strong>{KINDS[p.kind]?.label} · {nameOf(p.student_id)}</strong><p>{p.from_date === p.to_date ? p.from_date : `${p.from_date} إلى ${p.to_date}`}{p.leave_time ? ` · ${p.leave_time.slice(0, 5)}` : ""}{p.note ? ` · ${p.note}` : ""}</p></div>
        <Button size="sm" variant="outline" onClick={() => void cancelPerm(p)}>إلغاء</Button></div>)}</div>}
    </article>}
  </>;
}

// ───────── المدرسة: شاشة البوابة ─────────
type SchoolCall = Call & { students: { full_name: string; grade: string | null } | null };
type SchoolPerm = Perm & { students: { full_name: string; grade: string | null } | null };
export function SchoolGate({ schoolId }: { schoolId: string }) {
  const [calls, setCalls] = useState<SchoolCall[]>([]);
  const [perms, setPerms] = useState<SchoolPerm[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const load = useCallback(async () => {
    const today = riyadhDate();
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("pickup_calls").select("id,student_id,status,note,created_at,released_at,students(full_name,grade)").eq("school_id", schoolId).eq("call_date", today).neq("status", "cancelled").order("created_at"),
      supabase.from("student_permissions").select("id,student_id,kind,from_date,to_date,leave_time,note,status,students(full_name,grade)").eq("school_id", schoolId).eq("status", "active").lte("from_date", today).gte("to_date", today).order("leave_time", { nullsFirst: false }),
    ]);
    const rows = ((c ?? []) as unknown as SchoolCall[]).map((r) => ({ ...r, students: one(r.students) }));
    // تنبيه صوتي خفيف عند وصول نداء جديد
    const waiting = rows.filter((r) => r.status === "waiting").map((r) => r.id);
    if (seen.current && waiting.some((id) => !seen.current!.has(id))) { try { const ctx = new AudioContext(); const o = ctx.createOscillator(); o.frequency.value = 880; o.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.25); } catch { /* المتصفح قد يمنع الصوت */ } navigator.vibrate?.(200); }
    seen.current = new Set(waiting);
    setCalls(rows); setPerms(((p ?? []) as unknown as SchoolPerm[]).map((r) => ({ ...r, students: one(r.students) })));
  }, [schoolId]);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => {}); };
    void run(); const t = window.setInterval(() => void run(), 8000);
    const ch = supabase.channel(`gate-${schoolId}`).on("postgres_changes", { event: "*", schema: "public", table: "pickup_calls", filter: `school_id=eq.${schoolId}` }, () => void run()).subscribe();
    return () => { alive = false; window.clearInterval(t); void supabase.removeChannel(ch); };
  }, [load, schoolId]);
  const release = async (c: SchoolCall) => { setBusy(c.id); await supabase.rpc("update_pickup_call", { p_call: c.id, p_status: "released" }); setBusy(null); await load(); };
  const waiting = calls.filter((c) => c.status === "waiting");
  const released = calls.filter((c) => c.status === "released");
  return <>
    <div className="welcome"><div><p className="eyebrow">مباشر · يتحدث تلقائيًا</p><h1>نداء البوابة</h1><p>أولياء الأمور الواصلون الآن، والتصاريح المسجلة لليوم. افتح هذه الصفحة على شاشة عند البوابة.</p></div></div>
    <article className="panel ops-panel gate-board">
      <div className="panel-head"><div><p className="eyebrow">بانتظار التسليم</p><h2>{waiting.length ? `${waiting.length} طالب` : "لا يوجد نداء الآن"}</h2></div><Bell className="title-icon" /></div>
      {waiting.map((c) => <div className="gate-row" key={c.id}><div><strong>{c.students?.full_name}</strong><p>{[c.students?.grade, `منذ ${timeOf(c.created_at)}`, c.note].filter(Boolean).join(" · ")}</p></div>
        <Button disabled={busy === c.id} onClick={() => void release(c)}><Check /> تم التسليم</Button></div>)}
    </article>
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">اليوم</p><h2>التصاريح ({perms.length})</h2></div><CalendarClock className="title-icon" /></div>
      {perms.length === 0 && <p className="muted-label">لا توجد تصاريح لليوم.</p>}
      {perms.map((p) => <div className="ops-row" key={p.id}><div><strong>{p.students?.full_name}</strong><p>{[KINDS[p.kind]?.label, p.leave_time ? `الساعة ${p.leave_time.slice(0, 5)}` : "", p.note].filter(Boolean).join(" · ")}</p></div>
        <Badge className={`status-badge ${p.kind === "absence" ? "tone-2" : "tone-1"}`}>{KINDS[p.kind]?.label}</Badge></div>)}
    </article>
    {released.length > 0 && <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">اليوم</p><h2>سُلّموا ({released.length})</h2></div></div>
      {released.map((c) => <div className="ops-row" key={c.id}><div><strong>{c.students?.full_name}</strong><p>الساعة {timeOf(c.released_at ?? c.created_at)}</p></div></div>)}
    </article>}
  </>;
}
