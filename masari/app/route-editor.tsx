"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Archive, Clock, Combine, Copy, MapPin, Pencil, Plus, Printer, RotateCcw, Shuffle, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { MapPicker, parseCoords } from "./school-form";
import { TripMap } from "./trip-map";
import { DAYS, DaysPicker, RouteSheet, RouteStudents, mergeGroups, nearbyGroups, optimizedOrder, saveStopTimes, stopTimes, type RStudent } from "./route-tools";

// بطاقة المسار في حساب المدرسة: تعديل الاسم والموعد والباص والسائق، وإضافة المحطات وحذفها وترتيبها وتعديل مواقعها،
// وإنشاء مسار العودة، وحذف المسار (أو أرشفته إن كان له سجل رحلات) لمدير/مديرة المدرسة.

export type EStop = { id: string; stop_order: number; label: string; stop_type: string; latitude: number | null; longitude: number | null; scheduled_time?: string | null };
export type ERoute = { id: string; name: string; direction: string; scheduled_time: string | null; estimated_duration_minutes?: number | null; is_active: boolean; archived_at?: string | null; days?: number[] | null; bus_id: string | null; driver_id: string | null; route_stops: EStop[] };
type Act = (fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, ok: string) => Promise<boolean>;
const stopType: Record<string, string> = { pickup: "صعود", dropoff: "نزول", school: "المدرسة" };
const directionLabel = (d: string) => d === "to_home" ? "إلى المنزل" : "إلى المدرسة";

function StopEditor({ route, stop, index, count, studentsHere, editing, busy, act, onMove }: { route: ERoute; stop: EStop; index: number; count: number; studentsHere: number; editing: boolean; busy: boolean; act: Act; onMove: (dir: -1 | 1) => void }) {
  const [label, setLabel] = useState(stop.label);
  const [mapOpen, setMapOpen] = useState(false);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(stop.latitude != null && stop.longitude != null ? { lat: stop.latitude, lng: stop.longitude } : null);
  const missing = stop.latitude == null || stop.longitude == null;
  const moved = point && (point.lat !== stop.latitude || point.lng !== stop.longitude);
  const remove = () => {
    if (route.route_stops.length <= 2) { window.alert("المسار يحتاج محطتين على الأقل."); return; }
    if (!window.confirm(studentsHere ? `حذف «${stop.label}»؟ ${studentsHere} طالب مسندون لها سيحتاجون محطة جديدة.` : `حذف «${stop.label}»؟`)) return;
    void act(async () => {
      const del = await supabase.from("route_stops").delete().eq("id", stop.id);
      if (del.error) return del;
      const rest = route.route_stops.filter((s) => s.id !== stop.id).map((s) => s.id);
      return supabase.rpc("school_reorder_stops", { p_route: route.id, p_stops: rest });
    }, `حُذفت محطة ${stop.label}.`);
  };
  return <div className={`ops-row ops-stop ${missing ? "ops-missing" : ""}`}>
    <div className="stop-main">
      {editing ? <input className="stop-label-input" value={label} onChange={(e) => setLabel(e.target.value)} aria-label={`اسم المحطة ${index + 1}`} /> : <strong>{index + 1}. {stop.label}</strong>}
      <p>{stop.scheduled_time ? `${stop.scheduled_time.slice(0, 5)} · ` : ""}{stopType[stop.stop_type] ?? stop.stop_type}{studentsHere ? ` · ${studentsHere} طالب` : ""}{missing && " · بلا موقع — لن تبدأ الرحلة قبل تحديده"}</p>
      {mapOpen && <div className="stop-map"><MapPicker value={point} onChange={setPoint} /></div>}
    </div>
    <div className="ops-actions">
      {editing && <>
        <button className="icon-btn" disabled={busy || index === 0} onClick={() => onMove(-1)} aria-label="تقديم المحطة"><ArrowUp /></button>
        <button className="icon-btn" disabled={busy || index === count - 1} onClick={() => onMove(1)} aria-label="تأخير المحطة"><ArrowDown /></button>
        {label.trim() && label.trim() !== stop.label && <Button size="sm" disabled={busy} onClick={() => void act(() => supabase.from("route_stops").update({ label: label.trim() }).eq("id", stop.id), "حُفظ اسم المحطة.")}>حفظ الاسم</Button>}
      </>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setMapOpen((o) => !o)}><MapPin /> {mapOpen ? "إغلاق الخريطة" : missing ? "حدد الموقع" : "الموقع"}</Button>
      {mapOpen && moved && <Button size="sm" disabled={busy} onClick={() => void act(() => supabase.from("route_stops").update({ latitude: point!.lat, longitude: point!.lng }).eq("id", stop.id), `حُفظ موقع ${stop.label}.`).then((ok) => ok && setMapOpen(false))}>حفظ الموقع</Button>}
      {editing && stop.stop_type !== "school" && <button className="icon-btn danger" disabled={busy} onClick={remove} aria-label={`حذف ${stop.label}`}><Trash2 /></button>}
    </div>
  </div>;
}

function AddStop({ route, busy, act }: { route: ERoute; busy: boolean; act: Act }) {
  const [label, setLabel] = useState("");
  const [coords, setCoords] = useState("");
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [pos, setPos] = useState("before-school");
  const p = point ?? parseCoords(coords);
  const add = () => {
    if (!p) return;
    const stops = route.route_stops;
    const schoolIdx = stops.findIndex((s) => s.stop_type === "school");
    // الموضع: قبل المدرسة (ذهاب) أو بعد آخر محطة، أو بعد محطة محددة
    let at = stops.length;
    if (pos === "before-school" && schoolIdx >= 0) at = route.direction === "to_home" ? stops.length : schoolIdx;
    else if (pos === "first") at = route.direction === "to_home" && schoolIdx === 0 ? 1 : 0;
    else if (pos.startsWith("after:")) at = stops.findIndex((s) => s.id === pos.slice(6)) + 1;
    void act(async () => {
      const ins = await supabase.from("route_stops").insert({ route_id: route.id, stop_order: stops.length + 1, label: label.trim(), stop_type: route.direction === "to_home" ? "dropoff" : "pickup", latitude: p.lat, longitude: p.lng }).select("id").single();
      if (ins.error || !ins.data) return { error: ins.error };
      const ids = stops.map((s) => s.id); ids.splice(at, 0, ins.data.id);
      return supabase.rpc("school_reorder_stops", { p_route: route.id, p_stops: ids });
    }, `أُضيفت محطة ${label.trim()}.`).then((ok) => { if (ok) { setLabel(""); setCoords(""); setPoint(null); } });
  };
  return <div className="add-stop">
    <p className="field-title">إضافة محطة</p>
    <div className="claim-grid">
      <label>اسم المحطة<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="مثال: حي الخالدية - شارع 12" /></label>
      <label>مكانها في الترتيب<select value={pos} onChange={(e) => setPos(e.target.value)}>
        <option value="before-school">{route.direction === "to_home" ? "آخر المسار" : "قبل المدرسة (آخر محطة صعود)"}</option>
        <option value="first">{route.direction === "to_home" ? "أول محطة بعد المدرسة" : "أول المسار"}</option>
        {route.route_stops.map((s, i) => <option key={s.id} value={`after:${s.id}`}>بعد {i + 1}. {s.label}</option>)}
      </select></label>
    </div>
    <MapPicker value={point} onChange={setPoint} />
    {!point && <input className="ops-coords" dir="ltr" value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="أو الصق الإحداثيات 24.15, 47.31" aria-label="إحداثيات المحطة الجديدة" />}
    <div className="ops-actions"><Button size="sm" disabled={busy || label.trim().length < 2 || !p} onClick={add}><Plus /> إضافة المحطة</Button></div>
  </div>;
}

export function RouteCard({ route, routes, buses, drivers, students, schoolName, studentCount, studentsAtStop, isAdmin, busy, act }: {
  route: ERoute; routes: ERoute[]; buses: { id: string; bus_number: string; plate_number: string; driver_id: string | null; capacity?: number }[]; drivers: { id: string; full_name: string; status: string }[];
  students: RStudent[]; schoolName: string; studentCount: number; studentsAtStop: (stopId: string) => number; isAdmin: boolean; busy: boolean; act: Act;
}) {
  const [days, setDays] = useState<number[]>(route.days ?? [0, 1, 2, 3, 4]);
  const [showStudents, setShowStudents] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [copyName, setCopyName] = useState("");
  const bus = buses.find((b) => b.id === route.bus_id);
  const over = bus?.capacity ? studentCount - bus.capacity : 0;
  const daysChanged = JSON.stringify(days) !== JSON.stringify(route.days ?? [0, 1, 2, 3, 4]);
  const groups = nearbyGroups(route);
  const optimized = optimizedOrder(route);
  const orderDiffers = optimized && optimized.join() !== route.route_stops.map((x) => x.id).join();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ name: route.name, time: route.scheduled_time?.slice(0, 5) ?? "", minutes: String(route.estimated_duration_minutes ?? ""), active: route.is_active });
  const [returnTime, setReturnTime] = useState("13:00");
  const archived = Boolean(route.archived_at);
  const stops = route.route_stops;
  const hasReturn = route.direction === "to_school" && routes.some((r) => r.direction === "to_home" && r.name === `${route.name} (عودة)`);
  const changed = daysChanged || f.name.trim() !== route.name || f.time !== (route.scheduled_time?.slice(0, 5) ?? "") || f.minutes !== String(route.estimated_duration_minutes ?? "") || f.active !== route.is_active;
  const move = (i: number, dir: -1 | 1) => {
    const ids = stops.map((s) => s.id); const j = i + dir; [ids[i], ids[j]] = [ids[j], ids[i]];
    void act(() => supabase.rpc("school_reorder_stops", { p_route: route.id, p_stops: ids }), "تم تغيير ترتيب المحطات.");
  };
  const saveInfo = () => void act(() => supabase.from("routes").update({ name: f.name.trim(), scheduled_time: f.time || null, estimated_duration_minutes: Number(f.minutes) > 0 ? Number(f.minutes) : null, is_active: f.active, days }).eq("id", route.id), "حُفظت بيانات المسار.");
  const remove = async () => {
    const { count } = await supabase.from("trips").select("id", { count: "exact", head: true }).eq("route_id", route.id);
    if ((count ?? 0) > 0) {
      if (!window.confirm(`لمسار «${route.name}» ${count} رحلة سابقة في السجل، فلا يُحذف حتى لا تضيع التقارير. أرشفته؟\nيتوقف المسار، وتُلغى رحلاته القادمة، ويُفك إسناد طلابه، ويُبلَّغ أولياء أمورهم.`)) return;
      void act(() => supabase.rpc("school_archive_route", { p_route: route.id, p_archive: true }), `أُرشف مسار ${route.name}.`);
      return;
    }
    if (!window.confirm(`حذف مسار «${route.name}» نهائيًا مع محطاته وإسناد ${studentCount} طالب؟`)) return;
    void act(() => supabase.from("routes").delete().eq("id", route.id), `حُذف مسار ${route.name}.`);
  };
  return <article className={`panel ops-panel route-card ${archived ? "archived" : ""}`}>
    <div className="panel-head">
      <div><p className="eyebrow">{directionLabel(route.direction)} · {route.scheduled_time?.slice(0, 5) ?? "—"} · {stops.length} محطات · {studentCount} طالب · {(route.days ?? [0, 1, 2, 3, 4]).length === 5 && !(route.days ?? [0, 1, 2, 3, 4]).some((d) => d > 4) ? "الأحد–الخميس" : (route.days ?? []).map((d) => DAYS[d]).join("، ")}</p><h2>{route.name}</h2></div>
      <div className="ops-actions">
        {over > 0 && !archived && <Badge className="status-badge tone-2">الباص ممتلئ: {studentCount}/{bus?.capacity} مقعد</Badge>}
        {bus?.capacity && over <= 0 && !archived ? <Badge className="status-badge tone-0">{studentCount}/{bus.capacity} مقعد</Badge> : null}
        {archived ? <Badge className="status-badge tone-2">مؤرشف</Badge> : !route.is_active && <Badge className="status-badge tone-1">متوقف</Badge>}
        {!archived && <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => setEditing((e) => !e)}><Pencil /> {editing ? "إنهاء التعديل" : "تعديل"}</Button>}
        {archived && isAdmin && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => supabase.rpc("school_archive_route", { p_route: route.id, p_archive: false }), `أُعيد مسار ${route.name}. أسند طلابه من جديد.`)}><RotateCcw /> إعادة المسار</Button>}
      </div>
    </div>
    {editing && <div className="route-info-form">
      <div className="claim-grid">
        <label>اسم المسار<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>موعد الانطلاق<input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></label>
        <label>المدة التقديرية (دقيقة)<input type="number" min="5" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></label>
      </div>
      <p className="field-title">أيام التشغيل</p><DaysPicker value={days} onChange={setDays} />
      <label className="consent-check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> المسار يعمل (أزل العلامة لإيقافه مؤقتًا، فلا تُنشأ له رحلات)</label>
      <div className="ops-actions"><Button size="sm" disabled={busy || !changed || f.name.trim().length < 2} onClick={saveInfo}>حفظ البيانات</Button></div>
    </div>}
    {!archived && <div className="driver-form">
      <label>الباص<select value={route.bus_id ?? ""} disabled={busy} onChange={(e) => {
        const bus = buses.find((b) => b.id === e.target.value);
        const patch = { bus_id: e.target.value || null, ...(bus?.driver_id && !route.driver_id ? { driver_id: bus.driver_id } : {}) };
        void act(() => supabase.from("routes").update(patch).eq("id", route.id), "تم تحديث باص المسار.");
      }}><option value="">— بلا باص —</option>{buses.map((b) => <option key={b.id} value={b.id}>باص {b.bus_number} · {b.plate_number}</option>)}</select></label>
      <label>السائق<select value={route.driver_id ?? ""} disabled={busy} onChange={(e) => void act(() => supabase.from("routes").update({ driver_id: e.target.value || null }).eq("id", route.id), "تم تحديث سائق المسار.")}>
        <option value="">— بلا سائق —</option>{drivers.filter((d) => d.status === "active").map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
      </select></label>
    </div>}
    {stops.some((s) => s.latitude != null) && <TripMap className="route-card-map" stops={stops.filter((s) => s.latitude != null && s.longitude != null).map((s) => ({ lat: s.latitude!, lng: s.longitude!, label: s.label }))} />}
    {!archived && <div className="route-tools">
      <Button size="sm" variant="outline" disabled={busy || !stopTimes(route)} title={stopTimes(route) ? "" : "يحتاج موعد انطلاق ومواقع لكل المحطات"} onClick={() => void act(() => saveStopTimes(route), "حُسبت أوقات المحطات وحُفظت، وأُبلغ أولياء الأمور.")}><Clock /> احسب أوقات المحطات</Button>
      {orderDiffers && <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm("ترتيب المحطات لأقصر طريق؟")) void act(() => supabase.rpc("school_reorder_stops", { p_route: route.id, p_stops: optimized }), "رُتبت المحطات لأقصر طريق. احسب أوقات المحطات من جديد."); }}><Shuffle /> رتّب لأقصر طريق</Button>}
      {groups.length > 0 && <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm(`دمج المحطات المتقاربة (أقل من 300م) في نقاط تجمع؟\n${groups.map((g) => `${g.keep.label} ← ${g.merge.map((m) => m.label).join("، ")}`).join("\n")}\nيُنقل طلابها لنقطة التجمع ويُبلَّغ أولياء أمورهم.`)) void act(() => mergeGroups(route, groups), "أُنشئت نقاط التجمع ونُقل الطلاب إليها."); }}><Combine /> نقاط تجمع ({groups.length})</Button>}
      <Button size="sm" variant="outline" onClick={() => setShowStudents((v) => !v)}><Users /> {showStudents ? "إخفاء الطلاب" : "الطلاب ونقلهم"}</Button>
      <Button size="sm" variant="outline" onClick={() => setSheet(true)}><Printer /> كشف السائق</Button>
    </div>}
    {showStudents && <RouteStudents route={route} routes={routes} students={students} busy={busy} act={act} />}
    {sheet && <RouteSheet route={route} students={students} schoolName={schoolName} busLabel={bus ? `باص ${bus.bus_number} · ${bus.plate_number}` : "بلا باص"} driverName={drivers.find((d) => d.id === route.driver_id)?.full_name ?? "—"} onClose={() => setSheet(false)} />}
    <p className="eyebrow ops-subhead">المحطات بالترتيب</p>
    {stops.map((s, i) => <StopEditor key={`${s.id}-${s.stop_order}-${s.label}`} route={route} stop={s} index={i} count={stops.length} studentsHere={studentsAtStop(s.id)} editing={editing} busy={busy} act={act} onMove={(d) => move(i, d)} />)}
    {editing && <AddStop route={route} busy={busy} act={act} />}
    {editing && <div className="route-danger">
      {route.direction === "to_school" && !hasReturn && <div className="inline-form"><span>إنشاء مسار العودة بالمحطات معكوسة ونفس الطلاب</span><input type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} aria-label="موعد العودة" />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => supabase.rpc("school_create_return_route", { p_route: route.id, p_time: returnTime }), `أُنشئ مسار ${route.name} (عودة).`)}><Copy /> إنشاء مسار العودة</Button></div>}
      <div className="inline-form"><span>نسخ المسار كقالب</span><input value={copyName} onChange={(e) => setCopyName(e.target.value)} placeholder="اسم المسار الجديد" aria-label="اسم النسخة" />
        <Button size="sm" variant="outline" disabled={busy || copyName.trim().length < 2} onClick={() => void act(() => supabase.rpc("school_copy_route", { p_route: route.id, p_name: copyName.trim() }), `أُنشئ مسار ${copyName.trim()} بنفس المحطات.`).then((ok) => ok && setCopyName(""))}><Copy /> نسخ</Button></div>
      {isAdmin ? <Button size="sm" variant="outline" className="danger-outline" disabled={busy} onClick={() => void remove()}><Trash2 /> حذف المسار</Button>
        : <p className="muted-label">حذف المسار لمدير/مديرة المدرسة فقط.</p>}
    </div>}
    {archived && <p className="muted-label"><Archive className="inline-icon" /> مؤرشف منذ {route.archived_at?.slice(0, 10)}. يبقى في السجل والتقارير.</p>}
    {!editing && !archived && <p className="muted-label route-hint">اضغط «تعديل» لتغيير الاسم والموعد وإضافة المحطات وحذفها وترتيبها.</p>}
  </article>;
}
