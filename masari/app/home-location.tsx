"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock3, Home, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { MapPicker } from "./school-form";
import { TripMap } from "./trip-map";

// موقع منزل الطالب: ولي الأمر يحدده مرة واحدة، وبعدها أي تعديل طلب تعتمده المدرسة.

type Point = { lat: number; lng: number };
type Kid = { id: string; full_name: string; home_latitude: number | null; home_longitude: number | null; home_address: string | null };
type Req = { id: string; student_id: string; status: string; latitude: number; longitude: number; address: string | null; review_note: string | null; created_at: string };
const errText = (m: string) => m.includes("home_location_requests_one_open") || m.includes("duplicate") ? "لديك طلب تعديل قيد المراجعة لهذا الابن." : m.includes("HOME_ALREADY_SET") ? "الموقع محدد مسبقًا. أرسل طلب تعديل للمدرسة." : "تعذر الحفظ. حاول مرة أخرى.";
const reqState: Record<string, [string, string]> = { pending: ["بانتظار اعتماد المدرسة", "tone-1"], approved: ["اعتُمد", "tone-0"], rejected: ["لم يُعتمد", "tone-2"] };

function KidHome({ kid, req, onChanged }: { kid: Kid; req: Req | null; onChanged: () => Promise<void> }) {
  const has = kid.home_latitude != null && kid.home_longitude != null;
  const [editing, setEditing] = useState(false);
  const [point, setPoint] = useState<Point | null>(null);
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    if (!point) return;
    setBusy(true); setMsg(null);
    const { error } = has
      ? await supabase.from("home_location_requests").insert({ student_id: kid.id, latitude: point.lat, longitude: point.lng, address: address.trim() || null, note: note.trim() || null })
      : await supabase.rpc("guardian_set_home", { p_student: kid.id, p_lat: point.lat, p_lng: point.lng, p_address: address.trim() || null });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: errText(error.message) }); return; }
    setEditing(false); setPoint(null); setNote("");
    setMsg({ ok: true, text: has ? "أرسلنا طلب التعديل للمدرسة، وسيصلك إشعار عند اعتماده." : "تم حفظ موقع المنزل." });
    await onChanged();
  };
  const pending = req?.status === "pending";
  return <article className="panel ops-panel home-card">
    <div className="panel-head"><div><p className="eyebrow">موقع المنزل</p><h2>{kid.full_name}</h2>{kid.home_address && <p className="muted-label">{kid.home_address}</p>}</div><Home className="title-icon" /></div>
    {has && !editing && <TripMap stops={[]} home={{ lat: kid.home_latitude!, lng: kid.home_longitude!, label: `بيت ${kid.full_name}` }} className="home-map" />}
    {!has && !editing && <p className="muted-label">لم يُحدَّد موقع المنزل بعد. حدده مرة واحدة لتحدد المدرسة أقرب محطة.</p>}
    {req && <div className="ops-row"><div><strong>طلب تعديل الموقع</strong><p>{new Date(req.created_at).toLocaleDateString("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh" })}{req.address ? ` · ${req.address}` : ""}</p>{req.status === "rejected" && req.review_note && <p className="claim-state">السبب: {req.review_note}</p>}</div>
      <Badge className={`status-badge ${reqState[req.status]?.[1] ?? "tone-1"}`}>{reqState[req.status]?.[0] ?? req.status}</Badge></div>}
    {msg && <p className={`save-strip ops-message ${msg.ok ? "" : "ops-error"}`}>{msg.ok ? <Check /> : <X />}<span>{msg.text}</span></p>}
    {editing ? <>
      <p className="field-title">{has ? "الموقع الجديد" : "موقع المنزل"} <span className="muted-inline">اضغط على الخريطة أو «الموقع الحالي» أو الصق الإحداثيات</span></p>
      <MapPicker value={point ?? (has ? { lat: kid.home_latitude!, lng: kid.home_longitude! } : null)} onChange={setPoint} />
      <div className="claim-grid">
        <label htmlFor={`addr-${kid.id}`}>العنوان (الحي والشارع)<input id={`addr-${kid.id}`} value={address} onChange={(e) => setAddress(e.target.value)} /></label>
        {has && <label htmlFor={`note-${kid.id}`}>سبب التعديل<input id={`note-${kid.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="انتقلنا لمنزل جديد…" /></label>}
      </div>
      <div className="ops-actions"><Button disabled={busy || !point} onClick={() => void save()}>{busy ? "جارٍ الإرسال…" : has ? "إرسال طلب التعديل للمدرسة" : "حفظ موقع المنزل"}</Button><Button variant="outline" onClick={() => { setEditing(false); setPoint(null); }}>إلغاء</Button></div>
    </> : !pending && <Button variant="outline" onClick={() => { setMsg(null); setEditing(true); }}><MapPin /> {has ? "طلب تعديل الموقع" : "تحديد موقع المنزل"}</Button>}
    {has && !editing && <p className="muted-label">تعديل الموقع يحتاج اعتماد المدرسة، لأنه قد يغيّر محطة ابنك.</p>}
  </article>;
}

export function ParentHomeLocations() {
  const [kids, setKids] = useState<Kid[] | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const load = useCallback(async () => {
    const [{ data: k }, { data: r }] = await Promise.all([
      supabase.from("students").select("id,full_name,home_latitude,home_longitude,home_address").order("full_name"),
      supabase.from("home_location_requests").select("id,student_id,status,latitude,longitude,address,review_note,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    setKids((k ?? []) as Kid[]); setReqs((r ?? []) as Req[]);
  }, []);
  useEffect(() => { let alive = true; void (async () => { if (alive) await load().catch(() => setKids([])); })(); return () => { alive = false; }; }, [load]);
  return <>
    <div className="welcome"><div><p className="eyebrow">ولي الأمر</p><h1>موقع المنزل</h1><p>تحدد موقع المنزل مرة واحدة، وأي تعديل بعدها يرسل للمدرسة لاعتماده.</p></div></div>
    {kids && kids.length === 0 && <article className="panel ops-panel"><p className="muted-label">لا يوجد أبناء مرتبطون بحسابك بعد.</p></article>}
    {kids?.map((k) => <KidHome key={k.id} kid={k} req={reqs.find((r) => r.student_id === k.id) ?? null} onChanged={load} />)}
  </>;
}

// ───────── للمدرسة: طلبات تعديل موقع المنزل ─────────
type SchoolReq = Req & { students: { full_name: string; home_latitude: number | null; home_longitude: number | null } | null; note: string | null };
export function HomeLocationRequests({ schoolId, onDone }: { schoolId: string; onDone?: (text: string) => void }) {
  const [rows, setRows] = useState<SchoolReq[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabase.from("home_location_requests").select("id,student_id,status,latitude,longitude,address,note,review_note,created_at,students(full_name,home_latitude,home_longitude)")
      .eq("school_id", schoolId).eq("status", "pending").order("created_at");
    setRows(((data ?? []) as unknown as SchoolReq[]).map((r) => ({ ...r, students: Array.isArray(r.students) ? r.students[0] ?? null : r.students })));
  }, [schoolId]);
  useEffect(() => { let alive = true; void (async () => { if (alive) await load().catch(() => {}); })(); return () => { alive = false; }; }, [load]);
  const review = async (r: SchoolReq, approve: boolean) => {
    let note: string | null = null;
    if (!approve) { note = window.prompt("سبب عدم الاعتماد"); if (!note?.trim()) return; }
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("review_home_location_request", { p_request: r.id, p_approve: approve, p_note: note });
    setBusy(false);
    if (error) { setErr("تعذر تنفيذ المراجعة. حاول مرة أخرى."); return; }
    onDone?.(approve ? `اعتمدت موقع منزل ${r.students?.full_name ?? "الطالب"}. راجع محطته في المسارات.` : "تم رفض الطلب وإبلاغ ولي الأمر.");
    await load();
  };
  if (!rows.length) return null;
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">أولياء الأمور</p><h2>طلبات تعديل موقع المنزل ({rows.length})</h2></div><Clock3 className="title-icon" /></div>
    {err && <p className="auth-message">{err}</p>}
    {rows.map((r) => <div className="home-req" key={r.id}>
      <div className="ops-row"><div><strong>{r.students?.full_name}</strong><p>{[r.address, r.note].filter(Boolean).join(" · ") || "بدون ملاحظة"}</p>
        <p><a className="text-link" href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noreferrer">الموقع الجديد على الخريطة</a></p></div>
        <div className="ops-actions"><Button size="sm" disabled={busy} onClick={() => void review(r, true)}><Check /> اعتماد</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void review(r, false)}><X /> رفض</Button></div></div>
      <TripMap stops={[]} home={{ lat: r.latitude, lng: r.longitude, label: "الموقع الجديد" }} previous={r.students?.home_latitude != null && r.students.home_longitude != null ? { lat: r.students.home_latitude, lng: r.students.home_longitude, label: "الموقع الحالي" } : null} className="home-map" />
    </div>)}
  </article>;
}
