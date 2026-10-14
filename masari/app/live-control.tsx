"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BusFront, Check, RadioTower, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

// برج المراقبة: كل الرحلات الجارية من live_trips() (تحترم صلاحيات الحساب)، والبلاغات المفتوحة.

type LiveTrip = {
  trip_id: string; school_name: string; route_name: string; direction: string; status: string;
  driver_name: string | null; bus_number: string | null; plate_number: string | null; started_at: string | null;
  latitude: number | null; longitude: number | null; accuracy: number | null; last_seen: string | null; offline_after_seconds: number;
  stops_total: number; stops_done: number; next_stop: string | null; students_on_bus: number; open_emergencies: number;
};
type TripAlert = { id: string; trip_id: string; type: "off_route" | "long_stop"; started_at: string; latitude: number | null; longitude: number | null; max_distance_m: number | null; trips: { routes: { name: string } | null } | null };
const alertText: Record<TripAlert["type"], string> = { off_route: "خارج المسار", long_stop: "توقف طويل" };
type Emergency = { id: string; type: string; description: string | null; status: string; created_at: string; latitude: number | null; longitude: number | null; trip_id: string | null };

const typeText: Record<string, string> = { emergency: "طارئ", breakdown: "عطل", delay: "تأخير", accident: "حادث", other: "أخرى" };
const timeText = (iso: string | null) => iso ? new Intl.DateTimeFormat("ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }).format(new Date(iso)) : "—";
const agoText = (iso: string | null, now: number) => {
  if (!iso) return "لا يوجد موقع بعد";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `قبل ${s} ث` : `قبل ${Math.round(s / 60)} د`;
};

export function LiveControl({ canHandleEmergencies }: { canHandleEmergencies: boolean }) {
  const [trips, setTrips] = useState<LiveTrip[]>([]);
  const [emergencies, setEmergencies] = useState<Emergency[]>([]);
  const [alerts, setAlerts] = useState<TripAlert[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState({ emergencies: 0, alerts: 0 });

  const load = useCallback(async () => {
    const [live, em, al] = await Promise.all([
      supabase.rpc("live_trips"),
      supabase.from("emergency_reports").select("id,type,description,status,created_at,latitude,longitude,trip_id", { count: "exact" }).neq("status", "resolved").order("created_at", { ascending: false }).limit(50),
      supabase.from("trip_alerts").select("id,trip_id,type,started_at,latitude,longitude,max_distance_m,trips(routes(name))", { count: "exact" }).eq("status", "open").order("started_at", { ascending: false }).limit(50),
    ]);
    setTrips((live.data as LiveTrip[] | null) ?? []);
    setEmergencies(em.data ?? []);
    // العدد الحقيقي من الخادم، لا عدد ما عُرض في القائمة
    setCounts({ emergencies: em.count ?? (em.data ?? []).length, alerts: al.count ?? (al.data ?? []).length });
    setAlerts(((al.data ?? []) as unknown as (Omit<TripAlert, "trips"> & { trips: unknown })[]).map((a) => { const t = Array.isArray(a.trips) ? a.trips[0] : a.trips as { routes: unknown } | null; const r = t ? (Array.isArray(t.routes) ? t.routes[0] : t.routes) as { name: string } | null : null; return { ...a, trips: t ? { routes: r } : null }; }));
    setNow(Date.now());
    setLoaded(true);
  }, []);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => {}); };
    void run();
    const timer = window.setInterval(() => void run(), 15000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [load]);

  const handle = async (report: Emergency, status: "acknowledged" | "resolved") => {
    let note: string | null = null;
    if (status === "resolved") { note = window.prompt("كيف عولج البلاغ؟"); if (!note?.trim()) return; }
    setBusy(true); setMessage(null);
    const { error } = await supabase.rpc("update_emergency", { p_report: report.id, p_status: status, p_note: note });
    setBusy(false);
    if (error) { setMessage({ text: error.message.includes("FORBIDDEN") ? "ليست لديك صلاحية معالجة البلاغات." : "تعذر تحديث البلاغ.", ok: false }); return; }
    setMessage({ text: status === "acknowledged" ? "تم استلام البلاغ." : "تم إغلاق البلاغ.", ok: true });
    await load();
  };

  const resolveAlert = async (a: TripAlert) => {
    const note = window.prompt("ما سبب التنبيه؟ (مثلًا: تحويلة بسبب أعمال طريق)");
    if (note === null) return;
    setBusy(true); setMessage(null);
    const { error } = await supabase.rpc("resolve_trip_alert", { p_alert: a.id, p_note: note });
    setBusy(false);
    if (error) { setMessage({ text: error.message.includes("FORBIDDEN") ? "ليست لديك صلاحية إغلاق التنبيه." : "تعذر إغلاق التنبيه.", ok: false }); return; }
    setMessage({ text: "تم إغلاق التنبيه.", ok: true });
    await load();
  };
  const alertsFor = (tripId: string) => alerts.filter((a) => a.trip_id === tripId);
  const offline = (t: LiveTrip) => !t.last_seen || (now - new Date(t.last_seen).getTime()) / 1000 > t.offline_after_seconds;
  const onBus = trips.reduce((sum, t) => sum + Number(t.students_on_bus), 0);
  return <>
    <div className="welcome"><div><p className="eyebrow">مباشر · يتحدث كل 15 ثانية</p><h1>برج المراقبة</h1><p>الرحلات الجارية الآن ومواقع الباصات والبلاغات، وتنبيه تلقائي عند خروج الباص عن مساره أو توقفه الطويل.</p></div></div>
    {message && <p className={`save-strip ops-message ${message.ok ? "" : "ops-error"}`}>{message.ok ? <Check /> : <X />}<span>{message.text}</span></p>}
    <section className="trip-summary-grid">
      <article className="panel mini-metric"><span>رحلات جارية</span><strong>{trips.length}</strong></article>
      <article className="panel mini-metric"><span>طلاب في الباصات</span><strong>{onBus}</strong></article>
      <article className="panel mini-metric"><span>باصات منقطعة</span><strong>{trips.filter(offline).length}</strong></article>
      <article className="panel mini-metric"><span>بلاغات مفتوحة</span><strong>{counts.emergencies}</strong></article>
      <article className={`panel mini-metric ${counts.alerts ? "metric-warn" : ""}`}><span>تنبيهات المسار</span><strong>{counts.alerts}</strong></article>
    </section>
    {emergencies.length > 0 && <article className="panel ops-panel emergency-panel">
      <div className="panel-head"><div><p className="eyebrow">تحتاج تصرفًا</p><h2>البلاغات</h2></div><AlertTriangle className="title-icon" /></div>
      {emergencies.map((e) => <div className="ops-row" key={e.id}>
        <div><strong>{typeText[e.type] ?? e.type} · {timeText(e.created_at)}</strong><p>{e.description ?? "بلا وصف"}{e.latitude != null && e.longitude != null && <> · <a href={`https://www.google.com/maps?q=${e.latitude},${e.longitude}`} target="_blank" rel="noreferrer">الموقع</a></>}</p></div>
        <div className="ops-actions">
          <Badge className={`status-badge ${e.status === "open" ? "tone-1" : "tone-2"}`}>{e.status === "open" ? "جديد" : "قيد المعالجة"}</Badge>
          {canHandleEmergencies && e.status === "open" && <Button size="sm" disabled={busy} onClick={() => void handle(e, "acknowledged")}>استلام</Button>}
          {canHandleEmergencies && <Button size="sm" variant="outline" disabled={busy} onClick={() => void handle(e, "resolved")}>إغلاق</Button>}
        </div>
      </div>)}
    </article>}
    {alerts.length > 0 && <article className="panel ops-panel emergency-panel">
      <div className="panel-head"><div><p className="eyebrow">مراقبة تلقائية</p><h2>تنبيهات المسار</h2></div><AlertTriangle className="title-icon" /></div>
      {alerts.map((a) => <div className="ops-row" key={a.id}>
        <div><strong>{alertText[a.type]} · {a.trips?.routes?.name ?? "رحلة"}</strong>
          <p>{a.type === "off_route" ? "الباص خارج مساره منذ " : "الباص متوقف خارج المحطات منذ "}{timeText(a.started_at)}{a.latitude != null && a.longitude != null && <> · <a href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`} target="_blank" rel="noreferrer">آخر موقع</a></>}</p></div>
        <div className="ops-actions"><Badge className="status-badge tone-1">مفتوح</Badge><Button size="sm" variant="outline" disabled={busy} onClick={() => void resolveAlert(a)}>إغلاق بملاحظة</Button></div>
      </div>)}
    </article>}
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">الآن</p><h2>الرحلات الجارية</h2></div><RadioTower className="title-icon" /></div>
      {loaded && trips.length === 0 && <p className="muted-label">لا توجد رحلات جارية الآن.</p>}
      {trips.map((t) => <div className="ops-row" key={t.trip_id}>
        <div><strong><BusFront className="inline-icon" /> {t.route_name} · {t.school_name}</strong>
          <p>{[t.direction === "to_home" ? "إلى المنزل" : "إلى المدرسة", t.driver_name && `السائق ${t.driver_name}`, t.bus_number && `باص ${t.bus_number}`, `بدأت ${timeText(t.started_at)}`].filter(Boolean).join(" · ")}</p>
          <p>{`${t.stops_done} من ${t.stops_total} محطات`}{t.next_stop && ` · التالية: ${t.next_stop}`}{` · ${t.students_on_bus} في الباص`}</p>
        </div>
        <div className="ops-actions">
          {Number(t.open_emergencies) > 0 && <Badge className="status-badge tone-1">بلاغ مفتوح</Badge>}
          {alertsFor(t.trip_id).map((a) => <Badge key={a.id} className="status-badge tone-1">{alertText[a.type]}</Badge>)}
          <Badge className={`status-badge ${offline(t) ? "tone-1" : "tone-0"}`}>{offline(t) ? "منقطع" : "متصل"} · {agoText(t.last_seen, now)}</Badge>
          {t.latitude != null && t.longitude != null && <a className="text-link" href={`https://www.google.com/maps?q=${t.latitude},${t.longitude}`} target="_blank" rel="noreferrer">على الخريطة</a>}
        </div>
      </div>)}
    </article>
  </>;
}
