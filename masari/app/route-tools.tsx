"use client";
/* eslint-disable react-hooks/exhaustive-deps -- التحميل يُعاد بتغيّر معرّف الرحلة فقط */

import { useEffect, useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { distM, orderStops, type PlannedStop } from "./route-planner";
import { TripMap } from "./trip-map";
import type { ERoute, EStop } from "./route-editor";

// أدوات المسار: أوقات المحطات، أقصر ترتيب، نقاط التجمع، نقل الطلاب، أيام التشغيل، طباعة الكشف، والمسار الفعلي.

export type RStudent = { id: string; full_name: string; grade?: string | null; student_route_assignments: { id: string; route_id: string; stop_id: string | null }[] };
type Act = (fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, ok: string) => Promise<boolean>;
const ROAD = 1.4, SPEED_MS = 25000 / 3600, DWELL_MIN = 1.5;
export const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const riyadhWeekday = () => ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Riyadh" }).format(new Date())] ?? 0;
const located = (s: EStop): s is EStop & { latitude: number; longitude: number } => s.latitude != null && s.longitude != null;
const pt = (s: EStop) => ({ lat: s.latitude!, lng: s.longitude! });

// ───────── أوقات المحطات المتوقعة ─────────
export function stopTimes(route: ERoute): string[] | null {
  if (!route.scheduled_time || !route.route_stops.every(located)) return null;
  const [h, m] = route.scheduled_time.split(":").map(Number);
  let t = h * 60 + m;
  return route.route_stops.map((s, i) => {
    if (i > 0) t += (distM(pt(route.route_stops[i - 1]), pt(s)) * ROAD) / SPEED_MS / 60 + DWELL_MIN;
    const mm = Math.round(t);
    return `${String(Math.floor(mm / 60) % 24).padStart(2, "0")}:${String(mm % 60).padStart(2, "0")}`;
  });
}
export async function saveStopTimes(route: ERoute) {
  const times = stopTimes(route);
  if (!times) return { error: { message: "MISSING_LOCATION_OR_TIME" } };
  for (let i = 0; i < route.route_stops.length; i++) {
    const { error } = await supabase.from("route_stops").update({ scheduled_time: `${times[i]}:00` }).eq("id", route.route_stops[i].id);
    if (error) return { error };
  }
  const mins = Math.max(5, Math.round(((Number(times[times.length - 1].slice(0, 2)) * 60 + Number(times[times.length - 1].slice(3))) - (Number(times[0].slice(0, 2)) * 60 + Number(times[0].slice(3))) + 1440) % 1440));
  return supabase.from("routes").update({ estimated_duration_minutes: mins }).eq("id", route.id);
}

// ───────── أقصر ترتيب ─────────
export function optimizedOrder(route: ERoute): string[] | null {
  const school = route.route_stops.find((s) => s.stop_type === "school");
  if (!school || !located(school) || !route.route_stops.every(located)) return null;
  const others: PlannedStop[] = route.route_stops.filter((s) => s.id !== school.id).map((s) => ({ lat: s.latitude!, lng: s.longitude!, label: s.id, students: [] }));
  const ordered = orderStops(others, pt(school)).map((s) => s.label);
  return route.direction === "to_home" ? [school.id, ...ordered.reverse()] : [...ordered, school.id];
}

// ───────── نقاط التجمع: دمج المحطات القريبة ─────────
export function nearbyGroups(route: ERoute, radius = 300): { keep: EStop; merge: EStop[] }[] {
  const groups: { keep: EStop; merge: EStop[] }[] = [];
  for (const s of route.route_stops.filter((x) => x.stop_type !== "school" && located(x))) {
    const g = groups.find((gr) => distM(pt(gr.keep), pt(s)) <= radius);
    if (g) g.merge.push(s); else groups.push({ keep: s, merge: [] });
  }
  return groups.filter((g) => g.merge.length > 0);
}
export async function mergeGroups(route: ERoute, groups: { keep: EStop; merge: EStop[] }[]) {
  const removed = new Set<string>();
  for (const g of groups) {
    const all = [g.keep, ...g.merge];
    const lat = all.reduce((a, s) => a + s.latitude!, 0) / all.length, lng = all.reduce((a, s) => a + s.longitude!, 0) / all.length;
    const ids = g.merge.map((s) => s.id);
    const a = await supabase.from("student_route_assignments").update({ stop_id: g.keep.id }).in("stop_id", ids);
    if (a.error) return a;
    const u = await supabase.from("route_stops").update({ latitude: +lat.toFixed(6), longitude: +lng.toFixed(6), label: g.keep.label.startsWith("نقطة تجمع") ? g.keep.label : `نقطة تجمع: ${g.keep.label}` }).eq("id", g.keep.id);
    if (u.error) return u;
    const d = await supabase.from("route_stops").delete().in("id", ids);
    if (d.error) return d;
    ids.forEach((id) => removed.add(id));
  }
  return supabase.rpc("school_reorder_stops", { p_route: route.id, p_stops: route.route_stops.map((s) => s.id).filter((id) => !removed.has(id)) });
}

// ───────── الطلاب في المسار ونقلهم ─────────
export function RouteStudents({ route, routes, students, busy, act }: { route: ERoute; routes: ERoute[]; students: RStudent[]; busy: boolean; act: Act }) {
  const targets = routes.filter((r) => !r.archived_at && r.direction === route.direction).flatMap((r) => r.route_stops.filter((s) => s.stop_type !== "school").map((s) => ({ routeId: r.id, stopId: s.id, label: r.id === route.id ? s.label : `${r.name} · ${s.label}` })));
  const on = students.map((st) => ({ st, a: st.student_route_assignments.find((x) => x.route_id === route.id) })).filter((x) => x.a);
  if (!on.length) return <p className="muted-label">لا يوجد طلاب مسندون لهذا المسار.</p>;
  return <div className="route-students">{route.route_stops.filter((s) => s.stop_type !== "school").map((stop) => {
    const here = on.filter((x) => x.a!.stop_id === stop.id);
    return <div key={stop.id} className="rs-stop"><strong>{stop.label} <span className="muted-inline">({here.length})</span></strong>
      {here.map(({ st, a }) => <div key={st.id} className="rs-student"><span>{st.full_name}</span>
        <select className="sub-driver" aria-label={`نقل ${st.full_name}`} value={`${route.id}|${stop.id}`} disabled={busy} onChange={(e) => {
          const [routeId, stopId] = e.target.value.split("|");
          void act(() => supabase.from("student_route_assignments").update({ route_id: routeId, stop_id: stopId, status: "active" }).eq("id", a!.id), `نُقل ${st.full_name}، وأُبلغ ولي أمره.`);
        }}>{targets.map((t) => <option key={t.stopId} value={`${t.routeId}|${t.stopId}`}>{t.label}</option>)}</select></div>)}
    </div>;
  })}{on.some((x) => !x.a!.stop_id) && <p className="muted-label">طلاب بلا محطة: {on.filter((x) => !x.a!.stop_id).map((x) => x.st.full_name).join("، ")}</p>}</div>;
}

// ───────── أيام التشغيل ─────────
export function DaysPicker({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  return <div className="days-picker" role="group" aria-label="أيام التشغيل">{DAYS.map((d, i) => <label key={d} className={value.includes(i) ? "on" : ""}>
    <input type="checkbox" checked={value.includes(i)} onChange={(e) => onChange(e.target.checked ? [...value, i].sort() : value.filter((x) => x !== i))} />{d}</label>)}</div>;
}

// ───────── كشف المسار للطباعة ─────────
export function RouteSheet({ route, students, schoolName, busLabel, driverName, onClose }: { route: ERoute; students: RStudent[]; schoolName: string; busLabel: string; driverName: string; onClose: () => void }) {
  const [guardians, setGuardians] = useState<Record<string, { name: string; phone: string | null }[]>>({});
  const on = students.filter((st) => st.student_route_assignments.some((a) => a.route_id === route.id));
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!on.length) return;
      const { data } = await supabase.from("guardian_students").select("student_id,guardians(full_name,phone)").in("student_id", on.map((s) => s.id));
      if (!alive) return;
      const map: Record<string, { name: string; phone: string | null }[]> = {};
      for (const row of (data ?? []) as unknown as { student_id: string; guardians: { full_name: string; phone: string | null } | { full_name: string; phone: string | null }[] | null }[]) {
        const g = Array.isArray(row.guardians) ? row.guardians[0] : row.guardians;
        if (g) (map[row.student_id] ??= []).push({ name: g.full_name, phone: g.phone });
      }
      setGuardians(map);
    })();
    return () => { alive = false; };
  }, [route.id]);
  const times = route.route_stops.map((s) => s.scheduled_time?.slice(0, 5) ?? null);
  return <div className="cards-sheet-overlay">
    <div className="cards-sheet-bar no-print"><strong>كشف المسار</strong><div className="ops-actions"><Button onClick={() => window.print()}><Printer /> طباعة</Button><Button variant="outline" onClick={onClose}><X /> إغلاق</Button></div></div>
    <article className="route-sheet print-area" dir="rtl">
      <header><h2>{route.name}</h2><p>{schoolName} · {route.direction === "to_home" ? "العودة" : "الذهاب"} · الانطلاق {route.scheduled_time?.slice(0, 5) ?? "—"} · {busLabel} · السائق {driverName}</p>
        <p>الأيام: {(route.days ?? []).map((d) => DAYS[d]).join("، ") || "—"} · {on.length} طالب</p></header>
      <table><thead><tr><th>#</th><th>المحطة</th><th>الوقت</th><th>الطالب</th><th>الصف</th><th>ولي الأمر</th><th>الجوال</th><th>✓</th></tr></thead>
        <tbody>{route.route_stops.flatMap((stop, i) => {
          const here = on.filter((st) => st.student_route_assignments.some((a) => a.route_id === route.id && a.stop_id === stop.id));
          if (!here.length) return [<tr key={stop.id} className="stop-only"><td>{i + 1}</td><td>{stop.label}</td><td>{times[i] ?? ""}</td><td colSpan={5}>{stop.stop_type === "school" ? "المدرسة" : "—"}</td></tr>];
          return here.map((st, j) => <tr key={`${stop.id}-${st.id}`}><td>{j === 0 ? i + 1 : ""}</td><td>{j === 0 ? stop.label : ""}</td><td>{j === 0 ? times[i] ?? "" : ""}</td><td>{st.full_name}</td><td>{st.grade ?? ""}</td>
            <td>{(guardians[st.id] ?? []).map((g) => g.name).join("، ")}</td><td dir="ltr">{(guardians[st.id] ?? []).map((g) => g.phone).filter(Boolean).join(" / ")}</td><td className="tick" /></tr>);
        })}</tbody></table>
      <p className="sheet-foot">للطوارئ: تواصل مع إدارة المدرسة. طُبع من مساري بتاريخ {new Date().toLocaleDateString("ar-SA-u-ca-gregory", { timeZone: "Asia/Riyadh" })}.</p>
    </article>
  </div>;
}

// ───────── المسار الفعلي مقابل المخطط ─────────
type TStop = { label: string; stop_order: number; scheduled_time: string | null; arrived_at: string | null; status: string; latitude: number | null; longitude: number | null };
const hm = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(iso));
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export function TripActual({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const [stops, setStops] = useState<TStop[] | null>(null);
  const [path, setPath] = useState<{ lat: number; lng: number }[]>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [{ data: s }, { data: v }] = await Promise.all([
        supabase.from("trip_stops").select("label,stop_order,scheduled_time,arrived_at,status,latitude,longitude").eq("trip_id", tripId).order("stop_order"),
        supabase.from("vehicle_locations").select("latitude,longitude,recorded_at").eq("trip_id", tripId).order("recorded_at").limit(2000),
      ]);
      if (!alive) return;
      setStops((s ?? []) as TStop[]);
      setPath(((v ?? []) as { latitude: number; longitude: number }[]).map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) })));
    })();
    return () => { alive = false; };
  }, [tripId]);
  if (!stops) return null;
  return <div className="trip-actual">
    <div className="ops-actions"><strong>المخطط (متقطع) مقابل الفعلي (برتقالي)</strong><Button size="sm" variant="outline" onClick={onClose}><X /> إغلاق</Button></div>
    <TripMap stops={stops.filter((s) => s.latitude != null).map((s) => ({ lat: s.latitude!, lng: s.longitude!, label: s.label, done: s.status === "arrived" }))} actual={path} />
    {!path.length && <p className="muted-label">لا يوجد مسار مسجل لهذه الرحلة (تُحذف المواقع بعد 90 يومًا).</p>}
    <div className="table-wrap"><table className="report-table"><thead><tr><th>المحطة</th><th>المخطط</th><th>الفعلي</th><th>الفرق</th></tr></thead>
      <tbody>{stops.map((s) => { const plan = s.scheduled_time?.slice(0, 5); const act = s.arrived_at ? hm(s.arrived_at) : null; const diff = plan && act ? toMin(act) - toMin(plan) : null;
        return <tr key={s.stop_order}><td>{s.stop_order}. {s.label}</td><td>{plan ?? "—"}</td><td>{act ?? (s.status === "skipped" ? "تُخطّيت" : "—")}</td>
          <td className={diff != null && diff > 5 ? "late" : ""}>{diff == null ? "—" : diff === 0 ? "في الموعد" : diff > 0 ? `متأخر ${diff} د` : `مبكر ${-diff} د`}</td></tr>; })}</tbody></table></div>
  </div>;
}
