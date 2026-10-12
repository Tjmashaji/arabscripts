"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, Check, ClipboardCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// فحص الباص اليومي قبل أول رحلة: بنود سريعة مع صورة اختيارية، ويُحفظ للمدرسة.

export const CHECK_ITEMS = ["الإطارات", "الفرامل", "المكيف", "طفاية الحريق", "حقيبة الإسعاف", "أحزمة الأمان", "الأبواب ومخرج الطوارئ", "نظافة الباص"];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());

export function VehicleCheck({ tripId, schoolId, onDone }: { tripId: string; schoolId: string; onDone?: () => void }) {
  const [done, setDone] = useState<boolean | null>(null);
  const [items, setItems] = useState<Record<string, boolean>>(() => Object.fromEntries(CHECK_ITEMS.map((i) => [i, true])));
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    const { data: t } = await supabase.from("trips").select("bus_id").eq("id", tripId).maybeSingle();
    if (!t?.bus_id) { setDone(true); return; }
    const { data } = await supabase.from("vehicle_checks").select("id").eq("bus_id", t.bus_id).eq("check_date", today()).limit(1);
    setDone(Boolean(data?.length));
  }, [tripId]);
  useEffect(() => { let alive = true; void (async () => { if (alive) await load().catch(() => setDone(false)); })(); return () => { alive = false; }; }, [load]);
  const submit = async () => {
    setBusy(true); setErr("");
    let path: string | null = null;
    if (photo) {
      path = `${schoolId}/${tripId}/${Date.now()}.${photo.type === "image/png" ? "png" : "jpg"}`;
      const up = await supabase.storage.from("vehicle-checks").upload(path, photo, { contentType: photo.type || "image/jpeg" });
      if (up.error) path = null;
    }
    const allOk = Object.values(items).every(Boolean);
    if (!allOk && !notes.trim()) { setBusy(false); setErr("اكتب ملاحظة عن البند غير السليم."); return; }
    const { error } = await supabase.rpc("submit_vehicle_check", { p_trip: tripId, p_items: items, p_notes: notes.trim() || null, p_photo: path });
    setBusy(false);
    if (error) { setErr("تعذر حفظ الفحص. حاول مرة أخرى."); return; }
    setDone(true); onDone?.();
  };
  if (done !== false) return null;
  const bad = Object.entries(items).filter(([, ok]) => !ok).map(([k]) => k);
  return <article className="panel ops-panel vehicle-check">
    <div className="panel-head"><div><p className="eyebrow">قبل أول رحلة اليوم</p><h2>فحص الباص</h2></div><ClipboardCheck className="title-icon" /></div>
    <p className="muted-label">مرّ على البنود وأزل العلامة عن أي بند غير سليم. لا تبدأ الرحلة قبل حفظ الفحص.</p>
    <div className="check-items">{CHECK_ITEMS.map((i) => <label key={i} className={items[i] ? "ok" : "bad"} htmlFor={`vc-${i}`}>
      <input id={`vc-${i}`} type="checkbox" checked={items[i]} onChange={(e) => setItems((cur) => ({ ...cur, [i]: e.target.checked }))} />{items[i] ? <Check /> : <X />} {i}</label>)}</div>
    <label htmlFor="vc-notes">ملاحظات{bad.length ? " (مطلوبة)" : " (اختياري)"}<input id="vc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder={bad.length ? `ما المشكلة في ${bad[0]}؟` : ""} /></label>
    <label className="scanner-photo vc-photo"><Camera /> {photo ? `الصورة: ${photo.name}` : "صورة للباص (اختياري)"}<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
    {bad.length > 0 && <p className="save-strip ops-message ops-error"><X /><span>سيصل للمدرسة تنبيه بالبنود غير السليمة: {bad.join("، ")}.</span></p>}
    {err && <p className="auth-message">{err}</p>}
    <Button className="wide-action" disabled={busy} onClick={() => void submit()}>{busy ? "جارٍ الحفظ…" : "حفظ الفحص"}</Button>
  </article>;
}

// للمدرسة: فحوصات اليوم
type CheckRow = { id: string; check_date: string; items: Record<string, boolean>; all_ok: boolean; notes: string | null; photo_path: string | null; created_at: string; buses: { bus_number: string } | null; drivers: { full_name: string } | null };
export function TodayChecks({ schoolId }: { schoolId: string }) {
  const [rows, setRows] = useState<CheckRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("vehicle_checks").select("id,check_date,items,all_ok,notes,photo_path,created_at,buses(bus_number),drivers(full_name)").eq("school_id", schoolId).eq("check_date", today()).order("created_at", { ascending: false });
      if (alive) setRows(((data ?? []) as unknown as CheckRow[]).map((r) => ({ ...r, buses: Array.isArray(r.buses) ? r.buses[0] ?? null : r.buses, drivers: Array.isArray(r.drivers) ? r.drivers[0] ?? null : r.drivers })));
    })().catch(() => setRows([]));
    return () => { alive = false; };
  }, [schoolId]);
  const openPhoto = async (path: string) => { const { data } = await supabase.storage.from("vehicle-checks").createSignedUrl(path, 300); if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener"); };
  if (!rows) return null;
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">السلامة</p><h2>فحص الباصات اليوم ({rows.length})</h2></div><ClipboardCheck className="title-icon" /></div>
    {rows.length === 0 && <p className="muted-label">لم يُسجَّل أي فحص اليوم بعد. يسجّله السائق قبل أول رحلة.</p>}
    {rows.map((r) => <div className="ops-row" key={r.id}><div><strong>الباص {r.buses?.bus_number ?? "—"} · {r.drivers?.full_name ?? "—"}</strong>
      <p>{r.all_ok ? "كل البنود سليمة" : `غير سليم: ${Object.entries(r.items).filter(([, ok]) => !ok).map(([k]) => k).join("، ")}`}{r.notes ? ` · ${r.notes}` : ""}</p></div>
      <div className="ops-actions"><span className={`status-badge ${r.all_ok ? "tone-0" : "tone-2"}`}>{r.all_ok ? "سليم" : "ملاحظة"}</span>{r.photo_path && <Button size="sm" variant="outline" onClick={() => void openPhoto(r.photo_path!)}><Camera /> الصورة</Button>}</div></div>)}
  </article>;
}
