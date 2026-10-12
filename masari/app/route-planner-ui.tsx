"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { suggestRoutes, type PlannedRoute, type PlannerStudent, type Point } from "./route-planner";

// واجهة «اقتراح المسارات»: تعرض الاقتراح على الخريطة، والمدرسة تختار السعة وتنشئ المسارات بضغطة.

const COLORS = ["#1f8a93", "#d9822b", "#6a4fb3", "#c23b3b", "#2f7d32", "#2b5fa8", "#a0527a", "#7a6a12"];
type Act = (fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, ok: string) => Promise<boolean>;

function PreviewMap({ routes, school }: { routes: PlannedRoute[]; school: Point }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !box.current) return;
      map.current?.remove();
      const m = L.map(box.current, { zoomControl: true }).setView([school.lat, school.lng], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      const bounds = L.latLngBounds([[school.lat, school.lng]]);
      L.marker([school.lat, school.lng], { icon: L.divIcon({ className: "plan-school", html: "🏫", iconSize: [26, 26] }) }).addTo(m).bindTooltip("المدرسة");
      routes.forEach((r, i) => {
        const color = COLORS[i % COLORS.length];
        const pts: [number, number][] = [...r.stops.map((s) => [s.lat, s.lng] as [number, number]), [school.lat, school.lng]];
        L.polyline(pts, { color, weight: 4, opacity: 0.85 }).addTo(m);
        r.stops.forEach((s, j) => {
          L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "plan-stop", html: `<span style="background:${color}">${j + 1}</span>`, iconSize: [24, 24] }) })
            .addTo(m).bindTooltip(`${s.label.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)} · ${s.students.length} طالب`);
          bounds.extend([s.lat, s.lng]);
        });
      });
      m.fitBounds(bounds, { padding: [24, 24] });
      map.current = m;
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, [routes, school]);
  return <div ref={box} className="plan-map" role="img" aria-label="خريطة المسارات المقترحة" />;
}

export function RoutePlanner({ schoolId, school, students, missingHome, defaultCapacity, busy, act }: {
  schoolId: string; school: Point | null; students: PlannerStudent[]; missingHome: number; defaultCapacity: number; busy: boolean; act: Act;
}) {
  const [open, setOpen] = useState(false);
  const [capacityInput, setCapacity] = useState<string | null>(null);
  const capacity = capacityInput ?? String(defaultCapacity || 30);
  const [time, setTime] = useState("06:30");
  const [returnTime, setReturnTime] = useState("13:30");
  const [withReturn, setWithReturn] = useState(true);
  const cap = Math.max(1, Math.min(80, Number(capacity) || 30));
  const plan = useMemo(() => school ? suggestRoutes(students, school, cap) : [], [students, school, cap]);

  const create = async () => {
    if (!school) return;
    await act(async () => {
      for (const [i, r] of plan.entries()) {
        const base = `مسار ${i + 1} — ${r.stops[0]?.label.replace(/^محطة /, "") ?? ""}`;
        for (const dir of withReturn ? ["to_school", "to_home"] as const : ["to_school"] as const) {
          const { data: route, error } = await supabase.from("routes").insert({ school_id: schoolId, name: dir === "to_school" ? base : `${base} (عودة)`, direction: dir, scheduled_time: dir === "to_school" ? time : returnTime, estimated_duration_minutes: Math.max(r.minutes, 10) }).select("id").single();
          if (error || !route) return { error };
          const homes = dir === "to_school" ? r.stops : [...r.stops].reverse();
          const rows = [...homes.map((s) => ({ label: s.label, type: dir === "to_school" ? "pickup" : "dropoff", lat: s.lat, lng: s.lng }))];
          const schoolStop = { label: "المدرسة", type: "school", lat: school.lat, lng: school.lng };
          const ordered = dir === "to_school" ? [...rows, schoolStop] : [schoolStop, ...rows];
          const { data: stops, error: se } = await supabase.from("route_stops").insert(ordered.map((s, k) => ({ route_id: route.id, stop_order: k + 1, label: s.label, stop_type: s.type, latitude: +s.lat.toFixed(6), longitude: +s.lng.toFixed(6) }))).select("id,stop_order");
          if (se || !stops) return { error: se };
          const offset = dir === "to_school" ? 1 : 2;
          const assignments = homes.flatMap((s, k) => s.students.map((st) => ({ student_id: st.id, route_id: route.id, stop_id: stops.find((x) => x.stop_order === k + offset)?.id })));
          const { error: ae } = await supabase.from("student_route_assignments").insert(assignments);
          if (ae) return { error: ae };
        }
      }
      return { error: null };
    }, `أُنشئ ${plan.length} ${withReturn ? "مسار ذهاب ومثلها للعودة" : "مسار"}، وأُسند كل طالب لمحطته. حدّد الباص والسائق لكل مسار.`);
    setOpen(false);
  };

  return <article className="panel ops-panel planner">
    <div className="panel-head"><div><p className="eyebrow">تلقائي</p><h2>اقتراح المسارات من مواقع المنازل</h2></div><Sparkles className="title-icon" /></div>
    <p className="muted-label">{students.length} طالب بموقع منزل ولم يُسند لمسار ذهاب بعد{missingHome ? ` · ${missingHome} بلا موقع منزل (لا يدخلون في الاقتراح)` : ""}.</p>
    {!school && <p className="auth-message">حدد موقع المدرسة أولًا من «موقع المدرسة».</p>}
    {school && students.length > 0 && !open && <Button variant="outline" onClick={() => setOpen(true)}><Sparkles /> اقترح المسارات</Button>}
    {open && school && <>
      <div className="claim-grid planner-grid">
        <label htmlFor="pl-cap">مقاعد الباص<input id="pl-cap" inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></label>
        <label htmlFor="pl-time">موعد الذهاب<input id="pl-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <label htmlFor="pl-rtime">موعد العودة<input id="pl-rtime" type="time" value={returnTime} disabled={!withReturn} onChange={(e) => setReturnTime(e.target.value)} /></label>
        <label className="planner-check" htmlFor="pl-ret"><input id="pl-ret" type="checkbox" checked={withReturn} onChange={(e) => setWithReturn(e.target.checked)} /> إنشاء مسار العودة أيضًا (بالترتيب المعاكس)</label>
      </div>
      <PreviewMap routes={plan} school={school} />
      <div className="planner-routes">{plan.map((r, i) => <div className="planner-route" key={i}>
        <strong><span className="plan-dot" style={{ background: COLORS[i % COLORS.length] }} /> مسار {i + 1}: {r.students} طالب · {r.stops.length} محطة · {r.distanceKm} كم · قرابة {r.minutes} دقيقة</strong>
        <p>{r.stops.map((s, j) => `${j + 1}. ${s.label} (${s.students.length})`).join(" ← ")} ← المدرسة</p>
      </div>)}</div>
      <p className="muted-label">المسافات والأوقات تقريبية. يمكنك تعديل مواقع المحطات وترتيبها بعد الإنشاء.</p>
      <div className="ops-actions"><Button disabled={busy || plan.length === 0} onClick={() => void create()}>إنشاء {plan.length} {withReturn ? "مسارات ذهاب وعودة" : "مسارات"}</Button><Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button></div>
    </>}
  </article>;
}
