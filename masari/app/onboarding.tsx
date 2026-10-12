"use client";

import { useCallback, useEffect, useState } from "react";
import { BusFront, Check, Clock3, School, Search, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { SchoolFinder } from "./school-directory";

// حساب مسجّل بلا دور معتمد بعد. كل دور يكمل طلبه هنا:
// ولي الأمر يختار مدرسة ابنه ويرسل طلب التسجيل، والسائق يختار مدرسته ويرسل طلب الانضمام،
// وإدارة المدرسة تطلب تفعيل مدرستها. بعد اعتماد المدرسة (أو مساري) يدخل بحسابه مباشرة.

export type SignupRole = "parent" | "driver" | "school";
export const SIGNUP_ROLES: { role: SignupRole; title: string; desc: string; icon: typeof Users }[] = [
  { role: "parent", title: "ولي أمر", desc: "سجّل ابنك في نقل مدرسته وتابع الباص", icon: Users },
  { role: "driver", title: "سائق", desc: "انضم لمدرسة وابدأ رحلاتك", icon: BusFront },
  { role: "school", title: "إدارة مدرسة", desc: "اطلب تفعيل مدرستك في مساري", icon: School },
];
const isRole = (r?: string): r is SignupRole => r === "parent" || r === "driver" || r === "school";

function Steps({ role }: { role: SignupRole }) {
  const second = role === "parent" ? "اختر مدرسة ابنك وأرسل طلب التسجيل" : role === "driver" ? "اختر مدرستك وأرسل طلب الانضمام" : "اختر مدرستك واطلب تفعيلها";
  const third = role === "school" ? "تتحقق إدارة مساري وتفعّل المدرسة" : "تعتمد المدرسة طلبك فيتفعّل حسابك";
  return <ol className="onboard-steps">
    <li className="done"><span><Check /></span>أنشأت حسابك</li>
    <li className="current"><span>2</span>{second}</li>
    <li><span>3</span>{third}</li>
  </ol>;
}

// ───────── السائق: طلب انضمام لمدرسة ─────────
type FoundSchool = { id: string; name: string; district: string | null; city: string | null; status: string };
type DriverReq = { id: string; school_name: string; status: string; review_note: string | null; created_at: string };
const driverReqText: Record<string, [string, string]> = { pending: ["بانتظار اعتماد المدرسة", "tone-1"], approved: ["مقبول", "tone-0"], rejected: ["مرفوض", "tone-2"] };
const driverErr = (m: string) => m.includes("driver_requests_one_open") || m.includes("duplicate") ? "أرسلت طلبًا لهذه المدرسة، وهو قيد المراجعة." : m.includes("PHONE_REQUIRED") ? "اكتب رقم جوال صحيح." : m.includes("NAME_REQUIRED") ? "اكتب اسمك الكامل." : m.includes("row-level security") ? "المدرسة غير مفعّلة على مساري بعد." : "تعذر إرسال الطلب. حاول مرة أخرى.";

function DriverJoin({ defaultName, defaultPhone }: { defaultName: string; defaultPhone: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundSchool[] | null>(null);
  const [pick, setPick] = useState<FoundSchool | null>(null);
  const [f, setF] = useState({ name: defaultName, phone: defaultPhone, plate: "" });
  const [mine, setMine] = useState<DriverReq[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const loadMine = useCallback(async () => { const { data } = await supabase.rpc("my_driver_requests"); setMine((data ?? []) as DriverReq[]); }, []);
  useEffect(() => { let alive = true; void (async () => { if (alive) await loadMine().catch(() => {}); })(); return () => { alive = false; }; }, [loadMine]);
  const search = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("search_schools", { p_query: query.trim(), p_limit: 30 });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: "تعذر البحث. حاول مرة أخرى." }); return; }
    setResults(((data ?? []) as FoundSchool[]).filter((s) => s.status === "active"));
  };
  const send = async () => {
    if (!pick) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("driver_onboarding_requests").insert({ school_id: pick.id, driver_name: f.name.trim(), phone: f.phone.trim(), vehicle_plate: f.plate.trim() || null });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: driverErr(error.message) }); return; }
    setMsg({ ok: true, text: `أرسلنا طلبك إلى ${pick.name}. سيصلك إشعار عند الاعتماد، ثم تدخل بحسابك مباشرة.` });
    setPick(null); await loadMine();
  };
  const valid = f.name.trim().length >= 3 && /^\+?[0-9\s-]{9,20}$/.test(f.phone.trim());
  return <>
    {msg && <p className={`save-strip ops-message ${msg.ok ? "" : "ops-error"}`}>{msg.ok ? <Check /> : <X />}<span>{msg.text}</span></p>}
    {pick ? <article className="panel ops-panel claim-form">
      <div className="panel-head"><div><p className="eyebrow">طلب انضمام سائق</p><h2>{pick.name}</h2></div><BusFront className="title-icon" /></div>
      <div className="claim-grid">
        <label htmlFor="dj-name">الاسم الكامل<input id="dj-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label htmlFor="dj-phone">الجوال<input id="dj-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} dir="ltr" inputMode="tel" placeholder="05xxxxxxxx" /></label>
        <label htmlFor="dj-plate">لوحة المركبة (اختياري)<input id="dj-plate" value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} /></label>
      </div>
      <div className="ops-actions"><Button disabled={busy || !valid} onClick={() => void send()}>{busy ? "جارٍ الإرسال…" : "إرسال طلب الانضمام"}</Button><Button variant="outline" onClick={() => setPick(null)}>رجوع</Button></div>
    </article> : <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">سائق</p><h2>ابحث عن المدرسة التي تعمل لها</h2></div><Search className="title-icon" /></div>
      <form className="finder-search" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اسم المدرسة أو الحي أو المدينة" aria-label="البحث عن مدرسة" />
        <Button type="submit" disabled={busy}><Search /> بحث</Button>
      </form>
      {results && (results.length === 0 ? <p className="muted-label">لا توجد مدرسة مفعّلة بهذا الاسم. المدرسة يجب أن تكون مشتركة في مساري.</p>
        : results.map((s) => <div className="ops-row" key={s.id}><div><strong>{s.name}</strong><p>{[s.district, s.city].filter(Boolean).join(" · ") || "—"}</p></div>
          <div className="ops-actions"><Button size="sm" onClick={() => { setMsg(null); setPick(s); }}><BusFront /> انضم سائقًا</Button></div></div>))}
    </article>}
    {mine.length > 0 && <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">طلباتك</p><h2>طلبات الانضمام</h2></div><Clock3 className="title-icon" /></div>
      {mine.map((r) => <div className="ops-row" key={r.id}><div><strong>{r.school_name}</strong>{r.status === "rejected" && r.review_note && <p className="claim-state">السبب: {r.review_note}</p>}</div>
        <Badge className={`status-badge ${driverReqText[r.status]?.[1] ?? "tone-1"}`}>{driverReqText[r.status]?.[0] ?? r.status}</Badge></div>)}
    </article>}
  </>;
}

export function PendingAccount({ email, name, phone, requestedRole, suspended, onSignOut, onRecheck }: { email: string; name?: string; phone?: string; requestedRole?: string; suspended: boolean; onSignOut: () => void; onRecheck: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<SignupRole | null>(isRole(requestedRole) ? requestedRole : null);
  const recheck = useCallback(async () => { setBusy(true); try { await onRecheck(); } finally { setBusy(false); } }, [onRecheck]);
  // تحقق تلقائي كل دقيقة: يدخل المستخدم فور اعتماده دون أن يضغط شيئًا
  useEffect(() => { if (suspended) return; const t = window.setInterval(() => { void onRecheck().catch(() => {}); }, 60000); return () => window.clearInterval(t); }, [onRecheck, suspended]);

  return <main dir="rtl" className="auth-page">
    <section className="auth-hero"><div className="brand-mark large"><BusFront /></div><p className="eyebrow">مساري</p><h1>{suspended ? "الحساب موقوف" : "أكمل طلبك"}</h1><p>{email}</p></section>
    <section className="auth-shell pending-shell">
      {suspended ? <article className="panel ops-panel"><p>تم إيقاف هذا الحساب. تواصل مع إدارة مساري لمعرفة السبب.</p></article> : <>
        {!role ? <article className="panel ops-panel">
          <div className="panel-head"><div><p className="eyebrow">خطوة واحدة</p><h2>ما دورك في مساري؟</h2></div></div>
          <div className="role-cards">{SIGNUP_ROLES.map((r) => <button key={r.role} onClick={() => setRole(r.role)}><r.icon /><strong>{r.title}</strong><span>{r.desc}</span></button>)}</div>
        </article> : <>
          <Steps role={role} />
          {role === "driver" ? <DriverJoin defaultName={name ?? ""} defaultPhone={phone ?? ""} /> : <SchoolFinder email={email} schoolStaff={role === "school"} />}
          <p className="muted-label switch-role">سجّلت بدور غير صحيح؟ <button className="text-link" onClick={() => setRole(null)}>غيّر الدور</button></p>
        </>}
        <article className="panel ops-panel">
          <p className="muted-label">{role === "school"
            ? <>عند تفعيل المدرسة تُربط صلاحية مديرها بالبريد الذي اعتمدته إدارة مساري. إن كان بريدك <strong dir="ltr">{email}</strong> يتفعّل حسابك تلقائيًا.</>
            : <>بعد اعتماد طلبك يتفعّل حسابك، وتدخل في المرة القادمة ببريدك وكلمة المرور فقط. نتحقق تلقائيًا كل دقيقة.</>}</p>
          <Button variant="outline" className="wide-action" disabled={busy} onClick={() => void recheck()}>{busy ? "جارٍ التحقق…" : "تحقق الآن"}</Button>
        </article>
      </>}
      <button className="text-link" onClick={onSignOut}>تسجيل الخروج</button>
    </section>
  </main>;
}
