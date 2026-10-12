"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import { CalendarOff, Camera, Download, Flame, Plus, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { downloadCsv } from "./reports";

// إضافات تشغيل المدرسة: الإجازات، العناية بالباص (الوثائق والصيانة)، رخصة السائق، صورة الطالب،
// تحليل الحضور، وخريطة نقاط التأخير.

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const daysLeft = (d: string | null | undefined) => d ? Math.round((new Date(`${d}T12:00:00Z`).getTime() - new Date(`${today()}T12:00:00Z`).getTime()) / 86400000) : null;
export const blockerText: Record<string, string> = {
  SCHOOL_HOLIDAY: "اليوم إجازة؛ لا تُنشأ رحلات.",
  BUS_IN_MAINTENANCE: "الباص في الصيانة.",
  BUS_SERVICE_OVERDUE: "تأخرت صيانة الباص الدورية؛ سجّل الصيانة أولًا.",
  BUS_DOCS_EXPIRED: "انتهت استمارة الباص أو تأمينه أو فحصه الدوري.",
  DRIVER_LICENSE_EXPIRED: "رخصة السائق منتهية.",
};

// ========== الإجازات ==========
type Holiday = { id: string; title: string; starts_on: string; ends_on: string; cancelled_at: string | null };
export function useHolidays(schoolId: string | null | undefined) {
  const [rows, setRows] = useState<Holiday[]>([]);
  const load = useCallback(async () => {
    if (!schoolId) return;
    const { data } = await supabase.from("school_holidays").select("id,title,starts_on,ends_on,cancelled_at").eq("school_id", schoolId).is("cancelled_at", null).gte("ends_on", addDays(today(), -1)).order("starts_on");
    setRows((data ?? []) as Holiday[]);
  }, [schoolId]);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [load]);
  const t = today();
  return { rows, reload: load, todayHoliday: rows.find((h) => h.starts_on <= t && h.ends_on >= t) ?? null };
}

export function HolidaysPanel({ schoolId, canEdit, onChange }: { schoolId: string; canEdit: boolean; onChange?: () => void }) {
  const { rows, reload } = useHolidays(schoolId);
  const [form, setForm] = useState({ title: "", from: today(), to: today() });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = form.title.trim().length >= 2 && form.from && form.to && form.to >= form.from;
  const add = async () => {
    setBusy(true); setMsg("");
    const { error } = await supabase.from("school_holidays").insert({ school_id: schoolId, title: form.title.trim(), starts_on: form.from, ends_on: form.to });
    setBusy(false);
    if (error) { setMsg(error.code === "42501" ? "إضافة الإجازات لمدير المدرسة وموظف التشغيل." : "تعذر الحفظ. تأكد من التواريخ (حتى 120 يومًا)."); return; }
    setForm({ title: "", from: today(), to: today() }); setMsg("أُضيفت الإجازة وأُبلغ أولياء الأمور والسائقون."); await reload(); onChange?.();
  };
  const cancel = async (h: Holiday) => {
    if (!window.confirm(`إلغاء إجازة «${h.title}»؟ ستعمل الرحلات في موعدها ويُبلَّغ أولياء الأمور.`)) return;
    const { error } = await supabase.from("school_holidays").update({ cancelled_at: new Date().toISOString() }).eq("id", h.id);
    setMsg(error ? "تعذر الإلغاء." : "أُلغيت الإجازة."); await reload(); onChange?.();
  };
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">تقويم المدرسة</p><h2>الإجازات</h2></div><CalendarOff className="title-icon" /></div>
    <p className="muted-label">في أيام الإجازة لا تُنشأ رحلات ولا تصل تنبيهات تأخير، ويُبلَّغ أولياء الأمور والسائقون تلقائيًا.</p>
    {rows.length === 0 && <p className="muted-label">لا توجد إجازات قادمة.</p>}
    {rows.map((h) => <div className="ops-row" key={h.id}><div><strong>{h.title}</strong><p dir="ltr" className="ltr-inline">{h.starts_on}{h.ends_on !== h.starts_on ? ` → ${h.ends_on}` : ""}</p></div>
      {canEdit && <Button size="sm" variant="outline" onClick={() => void cancel(h)}><X /> إلغاء</Button>}</div>)}
    {canEdit && <div className="driver-form holiday-form">
      <label>المناسبة<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: إجازة اليوم الوطني" /></label>
      <label>من<input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: e.target.value > form.to ? e.target.value : form.to })} /></label>
      <label>إلى<input type="date" value={form.to} min={form.from} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
      <Button disabled={!valid || busy} onClick={() => void add()}><Plus /> إضافة إجازة</Button>
    </div>}
    {msg && <p className="muted-label">{msg}</p>}
  </article>;
}

// ========== العناية بالباص: الوثائق والصيانة ==========
export type BusDocs = { id: string; bus_number: string; registration_expiry?: string | null; insurance_expiry?: string | null; inspection_expiry?: string | null; next_service_on?: string | null; status?: string };
type Maint = { id: string; kind: string; done_on: string; odometer_km: number | null; cost: number | null; notes: string | null; next_due_on: string | null };
const KINDS: Record<string, string> = { service: "صيانة دورية", repair: "إصلاح", inspection: "فحص دوري", tires: "إطارات", ac: "تكييف", other: "أخرى" };
const DOCS: { key: "registration_expiry" | "insurance_expiry" | "inspection_expiry" | "next_service_on"; label: string }[] = [
  { key: "registration_expiry", label: "انتهاء الاستمارة" }, { key: "insurance_expiry", label: "انتهاء التأمين" },
  { key: "inspection_expiry", label: "انتهاء الفحص الدوري" }, { key: "next_service_on", label: "الصيانة القادمة" },
];
// شارة حالة الوثائق: الأقرب انتهاءً
export function busDocsBadge(bus: BusDocs): { text: string; tone: string } | null {
  const soon = DOCS.map((d) => ({ d, left: daysLeft(bus[d.key]) })).filter((x) => x.left !== null).sort((a, b) => a.left! - b.left!)[0];
  if (bus.status === "maintenance") return { text: "في الصيانة", tone: "tone-1" };
  if (!soon) return null;
  if (soon.left! < 0) return { text: `${soon.d.label}: منتهية`, tone: "tone-1" };
  if (soon.left! <= 30) return { text: `${soon.d.label} بعد ${soon.left} يوم`, tone: "tone-3" };
  return null;
}

export function BusCare({ bus, schoolId, canEdit, onSaved }: { bus: BusDocs; schoolId: string; canEdit: boolean; onSaved: () => void }) {
  const [docs, setDocs] = useState(() => Object.fromEntries(DOCS.map((d) => [d.key, bus[d.key] ?? ""])) as Record<string, string>);
  const [log, setLog] = useState<Maint[]>([]);
  const [form, setForm] = useState({ kind: "service", done_on: today(), odometer: "", cost: "", notes: "", next: addDays(today(), 90) });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("bus_maintenance").select("id,kind,done_on,odometer_km,cost,notes,next_due_on").eq("bus_id", bus.id).order("done_on", { ascending: false }).limit(20);
    setLog((data ?? []) as Maint[]);
  }, [bus.id]);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [load]);
  const saveDocs = async () => {
    setBusy(true); setMsg("");
    const patch = Object.fromEntries(DOCS.map((d) => [d.key, docs[d.key] || null]));
    const { error } = await supabase.from("buses").update(patch).eq("id", bus.id);
    setBusy(false); setMsg(error ? "تعذر حفظ التواريخ." : "حُفظت تواريخ الوثائق. سيصلك تنبيه قبل الانتهاء بـ30 و7 أيام."); if (!error) onSaved();
  };
  const setMaintenance = async (on: boolean) => {
    setBusy(true);
    const { error } = await supabase.from("buses").update({ status: on ? "maintenance" : "active" }).eq("id", bus.id);
    setBusy(false); setMsg(error ? "تعذر التحديث." : on ? "الباص في الصيانة؛ لن تُنشأ له رحلات." : "عاد الباص للخدمة."); if (!error) onSaved();
  };
  const addLog = async () => {
    setBusy(true); setMsg("");
    const { error } = await supabase.from("bus_maintenance").insert({ school_id: schoolId, bus_id: bus.id, kind: form.kind, done_on: form.done_on,
      odometer_km: form.odometer ? Number(form.odometer) : null, cost: form.cost ? Number(form.cost) : null, notes: form.notes.trim() || null, next_due_on: form.next || null });
    setBusy(false);
    if (error) { setMsg(error.code === "42501" ? "تسجيل الصيانة لمدير المدرسة وموظف التشغيل." : "تعذر الحفظ. تحقق من الأرقام."); return; }
    setForm({ ...form, odometer: "", cost: "", notes: "" }); setMsg("سُجّلت الصيانة."); await load(); onSaved();
  };
  return <div className="bus-care">
    <div className="bus-care-docs">
      {DOCS.map((d) => { const left = daysLeft(docs[d.key]); return <label key={d.key} className={left !== null && left < 0 ? "expired" : left !== null && left <= 30 ? "soon" : ""}>{d.label}
        <input type="date" value={docs[d.key]} disabled={!canEdit} onChange={(e) => setDocs({ ...docs, [d.key]: e.target.value })} />
        {left !== null && <small>{left < 0 ? `منتهية منذ ${-left} يوم` : left === 0 ? "اليوم" : `بعد ${left} يوم`}</small>}</label>; })}
    </div>
    {canEdit && <div className="ops-actions">
      <Button size="sm" disabled={busy} onClick={() => void saveDocs()}>حفظ التواريخ</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void setMaintenance(bus.status !== "maintenance")}><Wrench /> {bus.status === "maintenance" ? "إعادة الباص للخدمة" : "إدخال الباص الصيانة"}</Button>
    </div>}
    <p className="eyebrow">سجل الصيانة</p>
    {log.length === 0 && <p className="muted-label">لا يوجد سجل صيانة بعد.</p>}
    {log.map((m) => <div className="maint-row" key={m.id}><strong>{KINDS[m.kind] ?? m.kind}</strong><span dir="ltr">{m.done_on}</span>
      {m.odometer_km != null && <span>{m.odometer_km.toLocaleString("ar-SA")} كم</span>}{m.cost != null && <span>{Number(m.cost).toLocaleString("ar-SA")} ر.س</span>}
      {m.next_due_on && <span>القادمة <bdi dir="ltr">{m.next_due_on}</bdi></span>}{m.notes && <p>{m.notes}</p>}</div>)}
    {canEdit && <div className="driver-form maint-form">
      <label>النوع<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>التاريخ<input type="date" value={form.done_on} max={today()} onChange={(e) => setForm({ ...form, done_on: e.target.value })} /></label>
      <label>العداد (كم)<input inputMode="numeric" value={form.odometer} onChange={(e) => setForm({ ...form, odometer: e.target.value.replace(/\D/g, "") })} /></label>
      <label>التكلفة (ر.س)<input inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value.replace(/[^\d.]/g, "") })} /></label>
      <label>موعد الصيانة القادمة<input type="date" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} /></label>
      <label className="wide-field">ملاحظات<input value={form.notes} maxLength={500} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      <Button disabled={busy} onClick={() => void addLog()}><Plus /> تسجيل صيانة</Button>
    </div>}
    {msg && <p className="muted-label">{msg}</p>}
  </div>;
}

export function DriverLicense({ driverId, value, canEdit, onSaved }: { driverId: string; value: string | null; canEdit: boolean; onSaved: () => void }) {
  const [v, setV] = useState(value ?? "");
  const left = daysLeft(v || null);
  const save = async (next: string) => {
    setV(next);
    const { error } = await supabase.from("drivers").update({ license_expiry: next || null }).eq("id", driverId);
    if (!error) onSaved();
  };
  return <label className={`license-field ${left !== null && left < 0 ? "expired" : left !== null && left <= 30 ? "soon" : ""}`}>انتهاء الرخصة
    <input type="date" value={v} disabled={!canEdit} onChange={(e) => void save(e.target.value)} />
    {left !== null && <small>{left < 0 ? "منتهية — لا تُنشأ له رحلات" : `بعد ${left} يوم`}</small>}</label>;
}

// ========== صورة الطالب ==========
const shrink = (file: File, max = 480): Promise<Blob> => new Promise((resolve, reject) => {
  const img = new Image(); const url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    c.toBlob((b) => b ? resolve(b) : reject(new Error("BLOB")), "image/jpeg", 0.82);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("IMG")); };
  img.src = url;
});

export function usePhotoUrls(paths: (string | null | undefined)[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.filter(Boolean).sort().join("|");
  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (!list.length) return;
    let alive = true;
    void supabase.storage.from("student-photos").createSignedUrls(list, 3600).then(({ data }) => {
      if (!alive || !data) return;
      setUrls(Object.fromEntries(data.filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl])));
    });
    return () => { alive = false; };
  }, [key]);
  return urls;
}

export function StudentPhotoButton({ schoolId, studentId, name, hasPhoto, onSaved }: { schoolId: string; studentId: string; name: string; hasPhoto: boolean; onSaved: (msg: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await shrink(file);
      const path = `${schoolId}/${studentId}/photo.jpg`;
      const up = await supabase.storage.from("student-photos").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { error } = await supabase.from("students").update({ photo_path: path }).eq("id", studentId);
      if (error) throw error;
      onSaved(`حُفظت صورة ${name}. تظهر للسائق عند الركوب.`);
    } catch { onSaved("تعذر رفع الصورة. جرّب صورة أخرى."); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  };
  return <>
    <input ref={input} type="file" accept="image/*" capture="user" hidden onChange={(e) => void pick(e.target.files?.[0])} />
    <Button size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()}><Camera /> {busy ? "جارٍ الرفع…" : hasPhoto ? "تغيير الصورة" : "صورة"}</Button>
  </>;
}

// ========== تحليل الحضور ==========
type Att = { student_id: string; full_name: string; grade: string | null; trips: number; rode: number; absent: number; no_show: number; rate: number | null };
export function AttendancePanel({ schoolId }: { schoolId: string }) {
  const [range, setRange] = useState({ from: addDays(today(), -30), to: today() });
  const [rows, setRows] = useState<Att[] | null>(null);
  const [onlyLow, setOnlyLow] = useState(false);
  useEffect(() => {
    let alive = true;
    void supabase.rpc("school_attendance", { p_school: schoolId, p_from: range.from, p_to: range.to }).then(({ data }) => { if (alive) setRows((data ?? []) as Att[]); });
    return () => { alive = false; };
  }, [schoolId, range.from, range.to]);
  const shown = (rows ?? []).filter((r) => !onlyLow || (r.rate ?? 100) < 80);
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">الحضور</p><h2>حضور الطلاب في الباص</h2></div>
      <Button size="sm" variant="outline" disabled={!rows?.length} onClick={() => downloadCsv(`attendance-${range.from}-${range.to}.csv`, [{ title: `حضور الطلاب ${range.from} إلى ${range.to}`, head: ["الطالب", "الصف", "الرحلات", "ركب", "غياب مسجّل", "لم يحضر", "نسبة الحضور %"], rows: (rows ?? []).map((r) => [r.full_name, r.grade ?? "", r.trips, r.rode, r.absent, r.no_show, r.rate]) }])}><Download /> Excel</Button></div>
    <div className="driver-form attendance-filters">
      <label>من<input type="date" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
      <label>إلى<input type="date" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
      <label className="check-line" htmlFor="att-low"><input id="att-low" type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> أقل من 80% فقط</label>
    </div>
    {rows === null && <p className="muted-label">جارٍ التحميل…</p>}
    {rows?.length === 0 && <p className="muted-label">لا رحلات مكتملة في هذه الفترة.</p>}
    {shown.map((r) => <div className="ops-row attendance-row" key={r.student_id}>
      <div><strong>{r.full_name}</strong><p>{r.grade ?? "—"} · {r.rode} من {r.trips} رحلة{r.absent ? ` · غياب ${r.absent}` : ""}{r.no_show ? ` · لم يحضر ${r.no_show}` : ""}</p></div>
      <div className="att-bar" aria-label={`نسبة الحضور ${r.rate ?? 0}%`}><span style={{ width: `${r.rate ?? 0}%` }} className={(r.rate ?? 0) < 80 ? "low" : ""} /><b>{r.rate ?? 0}%</b></div>
    </div>)}
  </article>;
}

// ========== خريطة نقاط التأخير ==========
type Spot = { lat: number; lng: number; late_count: number; avg_late_min: number | null; alerts: number };
export function DelayMap({ schoolId }: { schoolId?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const [days, setDays] = useState(30);
  const [spots, setSpots] = useState<Spot[] | null>(null);
  useEffect(() => {
    let alive = true;
    void supabase.rpc("delay_hotspots", { p_days: days, p_school: schoolId ?? null }).then(({ data }) => { if (alive) setSpots((data ?? []) as Spot[]); });
    return () => { alive = false; };
  }, [days, schoolId]);
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      if (!map.current) {
        map.current = L.map(box.current).setView([24.15, 47.31], 11);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
      }
      const g = layer.current!; g.clearLayers();
      const list = spots ?? [];
      const max = Math.max(1, ...list.map((s) => s.late_count + s.alerts));
      list.forEach((s) => {
        const w = (s.late_count + s.alerts) / max;
        L.circleMarker([s.lat, s.lng], { radius: 8 + 22 * w, color: "#c2410c", weight: 1, fillColor: w > 0.6 ? "#dc2626" : w > 0.3 ? "#f97316" : "#facc15", fillOpacity: 0.55 })
          .addTo(g).bindPopup(`${s.late_count ? `تأخر ${s.late_count} مرة${s.avg_late_min ? ` (متوسط ${s.avg_late_min} د)` : ""}` : ""}${s.alerts ? `<br>انحراف عن المسار ${s.alerts}` : ""}`);
      });
      if (list.length) map.current!.fitBounds(L.latLngBounds(list.map((s) => [s.lat, s.lng] as [number, number])), { padding: [24, 24], maxZoom: 15 });
    });
    return () => { cancelled = true; };
  }, [spots]);
  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">تحليل</p><h2>نقاط التأخير والانحراف</h2></div><Flame className="title-icon" /></div>
    <div className="ops-actions">{[7, 30, 90].map((d) => <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>آخر {d} يومًا</Button>)}</div>
    <div ref={box} className="delay-map" role="application" aria-label="خريطة نقاط التأخير" />
    <p className="muted-label">{spots === null ? "جارٍ التحميل…" : spots.length === 0 ? "لا تأخيرات مسجّلة في هذه الفترة." : "كل دائرة محطة أو موقع تكرر فيه تأخر الباص أكثر من 5 دقائق أو انحرافه عن المسار؛ كلما كبرت واحمرّت زاد التكرار."}</p>
  </article>;
}

// صورة الطالب أو أول حرف من اسمه
export function StudentAvatar({ url, name }: { url?: string | null; name: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- رابط موقّع مؤقت من التخزين
  return url ? <img className="student-photo" src={url} alt={`صورة ${name}`} /> : <span className="student-avatar">{name.charAt(0)}</span>;
}
