"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Check, Clock3, FileUp, Hand, Plus, Search, School, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { MapPicker } from "./school-form";

// دليل المدارس: المدارس مستوردة مسبقًا بحالة «غير مشتركة بعد» (unclaimed)،
// وولي الأمر يطلب الخدمة، ومسؤول المدرسة يطلب التفعيل، وإدارة مساري تتحقق ثم تفعّل.

type Msg = { text: string; ok: boolean } | null;
const Flash = ({ msg }: { msg: Msg }) => msg && <p className={`save-strip ops-message ${msg.ok ? "" : "ops-error"}`}>{msg.ok ? <Check /> : <X />}<span>{msg.text}</span></p>;
const OSM_NOTE = <p className="muted-label osm-attr">بيانات المدارس المستوردة © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>;
const claimText: Record<string, string> = { new: "طلب التفعيل قيد المراجعة", contacting: "فريق مساري يتواصل معكم", accepted: "تم قبول الطلب", rejected: "رُفض طلب التفعيل" };
const statusText: Record<string, string> = { unclaimed: "غير مشتركة بعد", pending: "قيد المراجعة", active: "مشتركة", suspended: "موقوفة" };
const statusTone: Record<string, string> = { unclaimed: "tone-1", pending: "tone-1", active: "tone-0", suspended: "tone-2" };
const errText = (m: string) => m.includes("FORBIDDEN") ? "هذا الإجراء لإدارة مساري فقط." : m.includes("SCHOOL_NOT_ACTIVE") ? "المدرسة غير مفعّلة بعد." : m.includes("duplicate") || m.includes("unique") ? "لديك طلب مفتوح لهذه المدرسة بالفعل." : m.includes("REASON_REQUIRED") ? "اكتب سبب الرفض." : "تعذر تنفيذ الطلب. حاول مرة أخرى.";

type FoundSchool = { id: string; name: string; district: string | null; city: string | null; status: string; my_interest: boolean; my_claim_status: string | null };
type MyRequest = FoundSchool & { school_id: string; reject_reason: string | null };

// ───────── واجهة المستخدم: «ابحث عن مدرسة ابنك» ─────────
export function SchoolFinder({ email, schoolStaff }: { email: string; schoolStaff?: boolean }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoundSchool[] | null>(null);
  const [mine, setMine] = useState<MyRequest[]>([]);
  const [claimFor, setClaimFor] = useState<FoundSchool | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  const loadMine = useCallback(async () => {
    const { data } = await supabase.rpc("my_school_requests");
    setMine(((data ?? []) as MyRequest[]).map((r) => ({ ...r, id: r.school_id })));
  }, []);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await loadMine().catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [loadMine]);

  const search = async (keepMsg = false) => {
    setBusy(true); if (!keepMsg) setMsg(null);
    const { data, error } = await supabase.rpc("search_schools", { p_query: query.trim(), p_limit: 30 });
    setBusy(false);
    if (error) { setMsg({ text: errText(error.message), ok: false }); return; }
    setResults((data ?? []) as FoundSchool[]);
  };
  const refresh = async () => { await loadMine(); if (results) await search(true); };

  const toggleInterest = async (s: FoundSchool) => {
    setBusy(true); setMsg(null);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = s.my_interest
      ? await supabase.from("school_interest").delete().eq("school_id", s.id).eq("user_id", auth.user?.id ?? "")
      : await supabase.from("school_interest").insert({ school_id: s.id });
    setBusy(false);
    if (error) { setMsg({ text: errText(error.message), ok: false }); return; }
    setMsg({ text: s.my_interest ? `ألغيت طلب الخدمة في ${s.name}.` : `سجّلنا رغبتك في ${s.name}. سنبلغك فور تفعيل المدرسة على مساري.`, ok: true });
    await refresh();
  };

  const row = (s: FoundSchool) => <div className="ops-row" key={s.id}>
    <div><strong>{s.name}</strong><p>{[s.district, s.city].filter(Boolean).join(" · ") || "—"}</p>
      {s.my_claim_status && <p className="claim-state">{claimText[s.my_claim_status] ?? s.my_claim_status}{(s as MyRequest).reject_reason ? `: ${(s as MyRequest).reject_reason}` : ""}</p>}
      {s.status === "active" && <p>المدرسة على مساري. أعطِ إدارتها بريدك <strong dir="ltr">{email}</strong> لتضيفك، ثم اضغط «تحقق الآن».</p>}
    </div>
    <div className="ops-actions">
      <Badge className={`status-badge ${statusTone[s.status] ?? "tone-1"}`}>{statusText[s.status] ?? s.status}</Badge>
      {s.status === "unclaimed" && !schoolStaff && <Button size="sm" variant={s.my_interest ? "outline" : "default"} disabled={busy} onClick={() => void toggleInterest(s)}>{s.my_interest ? <><Check /> طلبت الخدمة (إلغاء)</> : <><Hand /> أريد الخدمة في هذه المدرسة</>}</Button>}
      {s.status === "unclaimed" && !(s.my_claim_status === "new" || s.my_claim_status === "contacting") && <Button size="sm" variant="outline" disabled={busy} onClick={() => { setMsg(null); setClaimFor(s); }}><Building2 /> أنا من إدارة المدرسة</Button>}
    </div>
  </div>;

  if (claimFor) return <ClaimForm school={claimFor} email={email} onCancel={() => setClaimFor(null)} onDone={async (text) => { setClaimFor(null); setMsg({ text, ok: true }); await refresh(); }} />;

  return <>
    <Flash msg={msg} />
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">{schoolStaff ? "إدارة مدرسة؟" : "ولي أمر؟"}</p><h2>{schoolStaff ? "ابحث عن مدرستك واطلب تفعيلها" : "ابحث عن مدرسة ابنك"}</h2></div><Search className="title-icon" /></div>
      <form className="finder-search" onSubmit={(e) => { e.preventDefault(); void search(); }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اسم المدرسة أو الحي أو المدينة" aria-label="البحث عن مدرسة" />
        <Button type="submit" disabled={busy}><Search /> بحث</Button>
      </form>
      {results && (results.length === 0
        ? <p className="muted-label">لم نجد مدرسة بهذا الاسم. جرّب جزءًا من الاسم، أو تواصل مع إدارة مساري لإضافتها.</p>
        : results.map(row))}
      {results && results.length > 0 && OSM_NOTE}
    </article>
    {mine.length > 0 && <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">طلباتك</p><h2>المدارس التي طلبتها</h2></div><Clock3 className="title-icon" /></div>
      {mine.map(row)}
    </article>}
  </>;
}

function ClaimForm({ school, email, onCancel, onDone }: { school: FoundSchool; email: string; onCancel: () => void; onDone: (text: string) => Promise<void> }) {
  const [f, setF] = useState({ contact_name: "", position: "", phone: "", email, note: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const valid = f.contact_name.trim().length >= 2 && /^\+?[0-9\s-]{8,20}$/.test(f.phone.trim()) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim());
  const submit = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.from("school_claim_requests").insert({
      school_id: school.id, contact_name: f.contact_name.trim(), position: f.position.trim() || null,
      phone: f.phone.trim(), email: f.email.trim().toLowerCase(), note: f.note.trim() || null,
    });
    setBusy(false);
    if (error) { setErr(errText(error.message)); return; }
    await onDone(`أرسلنا طلب تفعيل ${school.name}. سيتواصل معك فريق مساري للتحقق، وبعد التفعيل يصل بريد الدعوة إلى ${f.email.trim()}.`);
  };
  return <article className="panel ops-panel claim-form">
    <div className="panel-head"><div><p className="eyebrow">طلب تفعيل مدرسة</p><h2>{school.name}</h2></div><ShieldCheck className="title-icon" /></div>
    <p className="muted-label">لا يُنشأ حساب المدرسة مباشرة: يتحقق فريق مساري من أنك من إدارة المدرسة، ثم يفعّلها ويرسل دعوة لبريد مديرها.</p>
    <div className="claim-grid">
      <label>الاسم الكامل<input value={f.contact_name} onChange={set("contact_name")} /></label>
      <label>المنصب<input value={f.position} onChange={set("position")} placeholder="مدير المدرسة، وكيل…" /></label>
      <label>الجوال<input value={f.phone} onChange={set("phone")} dir="ltr" inputMode="tel" placeholder="05xxxxxxxx" /></label>
      <label>البريد الرسمي<input value={f.email} onChange={set("email")} dir="ltr" type="email" /></label>
      <label className="wide">ملاحظة (اختياري)<textarea value={f.note} onChange={set("note")} maxLength={1000} /></label>
    </div>
    {err && <p className="auth-message">{err}</p>}
    <div className="ops-actions"><Button disabled={busy || !valid} onClick={() => void submit()}>{busy ? "جارٍ الإرسال…" : "إرسال طلب التفعيل"}</Button><Button variant="outline" onClick={onCancel}>رجوع</Button></div>
  </article>;
}

// ───────── لوحة الإدارة: دليل المدارس وطلبات التفعيل ─────────
type DirRow = { id: string; name: string; name_en: string | null; district: string | null; city: string | null; status: string; source: string; ministry_code: string | null; latitude: number | null; longitude: number | null; phone: string | null; email: string | null; interest_count: number; open_claims: number };
type ClaimRow = { id: string; school_id: string; school_name: string; school_district: string | null; school_status: string; contact_name: string; position: string | null; phone: string; email: string; note: string | null; status: string; reject_reason: string | null; created_at: string; interest_count: number };
const sourceText: Record<string, string> = { osm: "OpenStreetMap", manual: "إضافة يدوية", import: "ملف CSV", self: "تسجيل ذاتي سابق" };

export function AdminDirectory({ canManage }: { canManage: boolean }) {
  const [status, setStatus] = useState<string>("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<DirRow[]>([]);
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<"" | "add" | "csv">("");

  const load = useCallback(async (s: string, q: string) => {
    const [dir, cl] = await Promise.all([
      supabase.rpc("admin_school_directory", { p_status: s || null, p_query: q.trim() || null }),
      supabase.rpc("admin_claim_requests", { p_status: null }),
    ]);
    if (dir.error) { setMsg({ text: errText(dir.error.message), ok: false }); return; }
    setRows((dir.data ?? []) as DirRow[]);
    setClaims((cl.data ?? []) as ClaimRow[]);
  }, []);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load("", "").catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [load]);
  const reload = () => load(status, query);

  const activate = async (schoolId: string, name: string, suggested?: string) => {
    const email = window.prompt(`بريد مدير مدرسة «${name}» (سيصله رابط الدخول وتُربط صلاحيته تلقائيًا):`, suggested ?? "");
    if (!email?.trim()) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.functions.invoke("invite-school-admin", { body: { school_id: schoolId, email: email.trim(), redirect_to: window.location.origin } });
    setBusy(false);
    if (error) {
      let detail = "";
      try { detail = ((await (error as { context?: Response }).context?.json()) as { error?: string })?.error ?? ""; } catch { /* لا تفاصيل */ }
      setMsg({ text: detail === "ALREADY_ACTIVE" ? "المدرسة مفعّلة ولها مدير بالفعل." : errText(detail || error.message), ok: false }); return;
    }
    const r = data as { linked_now?: boolean; invite_sent?: boolean; invite_note?: string | null; notified?: number };
    const who = r.linked_now ? "رُبط حساب المدير مباشرة" : r.invite_sent ? "أُرسلت دعوة إلى بريد المدير" : r.invite_note === "ALREADY_REGISTERED_UNCONFIRMED" ? "البريد مسجّل لكنه غير مؤكد: سيُربط بعد تأكيده ودخوله" : "تعذّر إرسال الدعوة؛ سيُربط المدير عند تسجيله بنفس البريد";
    setMsg({ text: `تم تفعيل ${name}. ${who}. أُبلغ ${r.notified ?? 0} من أولياء الأمور المهتمين.`, ok: true });
    await reload();
  };
  const review = async (c: ClaimRow, next: "contacting" | "rejected") => {
    let reason: string | null = null;
    if (next === "rejected") { reason = window.prompt(`سبب رفض طلب ${c.contact_name}:`); if (!reason?.trim()) return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("admin_review_claim", { p_request: c.id, p_status: next, p_reason: reason });
    setBusy(false);
    if (error) { setMsg({ text: errText(error.message), ok: false }); return; }
    setMsg({ text: next === "rejected" ? "تم رفض الطلب." : "تم تحديث الطلب: جارٍ التواصل.", ok: true });
    await reload();
  };
  const setSchoolStatus = async (s: DirRow, next: "active" | "suspended") => {
    let note: string | null = null;
    if (next === "suspended") { note = window.prompt(`سبب إيقاف ${s.name}:`); if (!note?.trim()) return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("admin_set_school_status", { p_school: s.id, p_status: next, p_note: note });
    setBusy(false);
    if (error) { setMsg({ text: errText(error.message), ok: false }); return; }
    setMsg({ text: next === "active" ? `أُعيد تفعيل ${s.name}.` : `تم إيقاف ${s.name}.`, ok: true });
    await reload();
  };

  const filters = [["", "الكل"], ["unclaimed", "غير مشتركة"], ["active", "مشتركة"], ["suspended", "موقوفة"], ["pending", "قيد المراجعة"]];
  return <>
    <div className="welcome"><div><p className="eyebrow">إدارة مساري</p><h1>دليل المدارس</h1><p>المدارس المستوردة غير مشتركة حتى تتحقق الإدارة من مسؤولها وتفعّلها. الترتيب حسب عدد طلبات أولياء الأمور.</p></div></div>
    <Flash msg={msg} />

    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">بانتظار التحقق</p><h2>طلبات التفعيل ({claims.length})</h2></div><ShieldCheck className="title-icon" /></div>
      {claims.length === 0 ? <p className="muted-label">لا توجد طلبات تفعيل مفتوحة.</p> : claims.map((c) => <div className="ops-row" key={c.id}>
        <div><strong>{c.school_name}</strong><p>{[c.contact_name, c.position, c.phone].filter(Boolean).join(" · ")} · <span dir="ltr">{c.email}</span></p>
          <p>{c.interest_count} من أولياء الأمور طلبوا الخدمة{c.note ? ` · ${c.note}` : ""}</p></div>
        <div className="ops-actions">
          <Badge className={`status-badge ${c.status === "new" ? "tone-1" : "tone-0"}`}>{c.status === "new" ? "جديد" : "جارٍ التواصل"}</Badge>
          {c.status === "new" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void review(c, "contacting")}>جارٍ التواصل</Button>}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void review(c, "rejected")}>رفض</Button>
          {c.school_status !== "active" && <Button size="sm" disabled={busy} onClick={() => void activate(c.school_id, c.school_name, c.email)}>تفعيل</Button>}
        </div>
      </div>)}
    </article>

    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">كل المدارس</p><h2>المدارس ({rows.length})</h2></div>
        <div className="ops-actions"><Button size="sm" variant={tool === "add" ? "default" : "outline"} onClick={() => setTool(tool === "add" ? "" : "add")}><Plus /> إضافة مدرسة</Button><Button size="sm" variant={tool === "csv" ? "default" : "outline"} onClick={() => setTool(tool === "csv" ? "" : "csv")}><FileUp /> رفع CSV</Button></div></div>
      {tool === "add" && <AddSchool onDone={async (text) => { setTool(""); setMsg({ text, ok: true }); await reload(); }} />}
      {tool === "csv" && <CsvImport onDone={async (text) => { setTool(""); setMsg({ text, ok: true }); await reload(); }} />}
      <div className="dir-filters">
        {filters.map(([id, label]) => <button key={id} className={status === id ? "active" : ""} onClick={() => { setStatus(id); void load(id, query); }}>{label}</button>)}
        <form onSubmit={(e) => { e.preventDefault(); void reload(); }}><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="اسم، حي، أو رقم وزاري" aria-label="بحث في المدارس" /><Button size="sm" type="submit" variant="outline"><Search /></Button></form>
      </div>
      {rows.length === 0 ? <p className="muted-label">لا توجد مدارس بهذا الفلتر.</p> : rows.map((s) => <div className="ops-row" key={s.id}>
        <div><strong>{s.name}</strong><p>{[s.district, s.city, s.ministry_code && `رقم وزاري ${s.ministry_code}`, sourceText[s.source] ?? s.source].filter(Boolean).join(" · ")}</p>
          <p>{s.interest_count} طلب ولي أمر{s.open_claims > 0 ? ` · ${s.open_claims} طلب تفعيل مفتوح` : ""}{s.latitude != null && s.longitude != null && <> · <a className="dir-map-link" href={`https://www.openstreetmap.org/?mlat=${s.latitude}&mlon=${s.longitude}#map=17/${s.latitude}/${s.longitude}`} target="_blank" rel="noreferrer">الموقع على الخريطة</a></>}</p></div>
        <div className="ops-actions">
          <Badge className={`status-badge ${statusTone[s.status] ?? "tone-1"}`}>{statusText[s.status] ?? s.status}</Badge>
          {(s.status === "unclaimed" || s.status === "pending") && <Button size="sm" disabled={busy} onClick={() => void activate(s.id, s.name)}>تفعيل</Button>}
          {canManage && s.status === "active" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void setSchoolStatus(s, "suspended")}>إيقاف</Button>}
          {canManage && s.status === "suspended" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void setSchoolStatus(s, "active")}>إعادة تفعيل</Button>}
        </div>
      </div>)}
      {OSM_NOTE}
    </article>
  </>;
}

type Point = { lat: number; lng: number };
type Dup = { id: string; name: string; status: string; distance_m: number };

function AddSchool({ onDone }: { onDone: (text: string) => Promise<void> }) {
  const [f, setF] = useState({ name: "", district: "", city: "الخرج", ministry_code: "", place_id: "" });
  const [point, setPoint] = useState<Point | null>(null);
  const [place, setPlace] = useState("");
  const [dups, setDups] = useState<Dup[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setDups(null); setF((p) => ({ ...p, [k]: e.target.value })); };

  // البحث على الخريطة عبر Nominatim (OpenStreetMap) لتحريك الدبوس فقط؛ لا يُحفظ شيء من نتيجته.
  const findOnMap = async () => {
    if (!place.trim()) return;
    setErr("");
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=sa&accept-language=ar&q=${encodeURIComponent(place.trim())}`);
      const [hit] = (await res.json()) as { lat: string; lon: string }[];
      if (hit) setPoint({ lat: +(+hit.lat).toFixed(6), lng: +(+hit.lon).toFixed(6) }); else setErr("لم نجد المكان. حرّك الدبوس يدويًا.");
    } catch { setErr("تعذر البحث على الخريطة الآن."); }
  };
  const save = async (force: boolean) => {
    if (!point) return;
    setBusy(true); setErr("");
    const { data, error } = await supabase.rpc("admin_add_school", {
      p_name: f.name.trim(), p_district: f.district.trim() || null, p_city: f.city.trim() || null, p_ministry_code: f.ministry_code.trim() || null,
      p_lat: point.lat, p_lng: point.lng, p_place_id: f.place_id.trim() || null, p_force: force,
    });
    setBusy(false);
    if (error) { setErr(errText(error.message)); return; }
    const r = data as { created: boolean; duplicates: Dup[] };
    if (!r.created) { setDups(r.duplicates); return; }
    await onDone(`أُضيفت ${f.name.trim()} بحالة «غير مشتركة بعد».`);
  };
  return <div className="dir-tool">
    <div className="claim-grid">
      <label>اسم المدرسة<input value={f.name} onChange={set("name")} /></label>
      <label>الحي<input value={f.district} onChange={set("district")} /></label>
      <label>المدينة<input value={f.city} onChange={set("city")} /></label>
      <label>الرقم الوزاري (اختياري)<input value={f.ministry_code} onChange={set("ministry_code")} dir="ltr" /></label>
      <label className="wide">Google place_id (اختياري — يُحفظ المعرّف فقط)<input value={f.place_id} onChange={set("place_id")} dir="ltr" /></label>
    </div>
    <form className="finder-search" onSubmit={(e) => { e.preventDefault(); void findOnMap(); }}><input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="ابحث عن الموقع على الخريطة (حي، شارع، معلم)" /><Button type="submit" variant="outline"><Search /> بحث</Button></form>
    <MapPicker value={point} onChange={(p) => { setDups(null); setPoint(p); }} />
    <p className="muted-label">{point ? `الموقع: ${point.lat}, ${point.lng}` : "اضغط على الخريطة لتحديد موقع المدرسة."}</p>
    {dups && dups.length > 0 && <div className="dup-box"><strong>مدارس مشابهة موجودة (خلال 150م أو بنفس الاسم/الرقم):</strong>
      {dups.map((d) => <p key={d.id}>{d.name} · {statusText[d.status] ?? d.status} · {d.distance_m} م</p>)}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(true)}>ليست نفسها — أضف على أي حال</Button></div>}
    {err && <p className="auth-message">{err}</p>}
    <Button disabled={busy || f.name.trim().length < 3 || !point} onClick={() => void save(false)}><School /> حفظ المدرسة</Button>
  </div>;
}

// CSV بسيط: الأعمدة name, district, ministry_code, lat, lng (و city اختياريًا). يدعم الحقول بين علامات تنصيص.
function parseCsv(text: string): Record<string, string>[] {
  const lines: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) { if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";" || ch === "\t") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; row.push(cell); lines.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); lines.push(row); }
  const [head, ...body] = lines.filter((l) => l.some((c) => c.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((l) => Object.fromEntries(keys.map((k, i) => [k, (l[i] ?? "").trim()])));
}

function CsvImport({ onDone }: { onDone: (text: string) => Promise<void> }) {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const read = async (file: File | undefined) => {
    setErr(""); setRows(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setErr("الملف أكبر من 2MB."); return; }
    const parsed = parseCsv(await file.text());
    if (!parsed.length || !("name" in parsed[0]) || !("lat" in parsed[0]) || !("lng" in parsed[0])) { setErr("يجب أن يحتوي الصف الأول على الأعمدة: name, district, ministry_code, lat, lng"); return; }
    if (parsed.length > 5000) { setErr("الحد الأقصى 5000 مدرسة في الملف."); return; }
    setRows(parsed);
  };
  const upload = async () => {
    if (!rows) return;
    setBusy(true); setErr("");
    const payload = rows.map((r) => ({ name: r.name, district: r.district || null, city: r.city || null, ministry_code: r.ministry_code || null, lat: r.lat ? Number(r.lat) : null, lng: r.lng ? Number(r.lng) : null }));
    const { data, error } = await supabase.rpc("admin_import_schools", { p_rows: payload, p_source: "import" });
    setBusy(false);
    if (error) { setErr(errText(error.message)); return; }
    const r = data as { inserted: number; updated: number; skipped: number };
    await onDone(`تم الاستيراد: ${r.inserted} جديدة، ${r.updated} محدّثة، ${r.skipped} صفوف ناقصة تم تجاهلها.`);
  };
  return <div className="dir-tool">
    <p className="muted-label">ملف CSV (يمكن حفظه من Excel) بالأعمدة: <code dir="ltr">name, district, ministry_code, lat, lng</code> و<code dir="ltr">city</code> اختياريًا. إعادة رفع نفس الملف تحدّث المدارس دون تكرار (حسب الرقم الوزاري).</p>
    <input type="file" accept=".csv,text/csv" onChange={(e) => void read(e.target.files?.[0])} />
    {rows && <p className="muted-label">جاهز: {rows.length} مدرسة. أول مدرسة: {rows[0]?.name}</p>}
    {err && <p className="auth-message">{err}</p>}
    <Button disabled={busy || !rows} onClick={() => void upload()}><FileUp /> استيراد</Button>
  </div>;
}
