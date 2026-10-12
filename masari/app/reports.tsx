"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Check, Download, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// التقارير الشهرية (للمدرسة وللإدارة التعليمية) مع تصدير يفتح في Excel، وتقييم السائق من ولي الأمر.

const thisMonth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit" }).format(new Date());
const pct = (v: number | null | undefined) => v == null ? "—" : `${v}%`;
const num = (v: number | string | null | undefined) => v == null ? "—" : String(v);

// ملف CSV بترميز UTF-8 مع BOM حتى يعرض Excel العربية صحيحة
export function downloadCsv(name: string, sections: { title: string; head: string[]; rows: (string | number | null)[][] }[]) {
  const esc = (v: string | number | null) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const text = sections.map((s) => [s.title, s.head.map(esc).join(","), ...s.rows.map((r) => r.map(esc).join(","))].join("\r\n")).join("\r\n\r\n");
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

type Totals = { trips: number; completed: number; cancelled: number; on_time_pct: number | null; avg_delay_min: number | null; rides: number; absences: number; alerts: number; emergencies: number; vehicle_issues: number; pickup_calls: number; permissions: number; driver_rating: number | null; students: number };
type Report = { month: string; school: string; totals: Totals; routes: { route: string; trips: number; completed: number; on_time_pct: number | null; avg_delay_min: number | null; absences: number }[];
  drivers: { driver: string; trips: number; on_time_pct: number | null; rating: number | null; ratings_count: number; comments: string[] | null }[]; days: { day: string; trips: number; on_time_pct: number | null; absences: number }[] };

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  return <div className={`report-tile ${tone ?? ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

export function SchoolReport({ schoolId }: { schoolId: string }) {
  const [month, setMonth] = useState(thisMonth());
  const [r, setR] = useState<Report | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(async (m: string) => {
    setErr("");
    const { data, error } = await supabase.rpc("school_monthly_report", { p_school: schoolId, p_month: `${m}-01` });
    if (error) { setErr("تعذر تحميل التقرير."); setR(null); return; }
    const rep = data as Report | null;
    setR(rep && rep.totals ? { ...rep, routes: rep.routes ?? [], drivers: rep.drivers ?? [], days: rep.days ?? [] } : null);
  }, [schoolId]);
  useEffect(() => { let alive = true; void (async () => { if (alive) await load(month).catch(() => {}); })(); return () => { alive = false; }; }, [load, month]);
  const exportIt = () => r && downloadCsv(`مساري-تقرير-${r.school}-${r.month}`, [
    { title: `تقرير ${r.school} — ${r.month}`, head: ["المؤشر", "القيمة"], rows: [["الرحلات", r.totals.trips], ["المكتملة", r.totals.completed], ["الملغاة", r.totals.cancelled], ["الالتزام بالموعد %", r.totals.on_time_pct], ["متوسط التأخر (دقيقة)", r.totals.avg_delay_min], ["مرات الركوب", r.totals.rides], ["الغياب", r.totals.absences], ["تنبيهات المسار", r.totals.alerts], ["البلاغات", r.totals.emergencies], ["ملاحظات فحص الباص", r.totals.vehicle_issues], ["نداءات البوابة", r.totals.pickup_calls], ["التصاريح", r.totals.permissions], ["تقييم السائقين", r.totals.driver_rating], ["الطلاب المشتركون", r.totals.students]] },
    { title: "المسارات", head: ["المسار", "الرحلات", "المكتملة", "الالتزام %", "متوسط التأخر", "الغياب"], rows: r.routes.map((x) => [x.route, x.trips, x.completed, x.on_time_pct, x.avg_delay_min, x.absences]) },
    { title: "السائقون", head: ["السائق", "الرحلات", "الالتزام %", "التقييم", "عدد التقييمات", "ملاحظات أولياء الأمور"], rows: r.drivers.map((x) => [x.driver, x.trips, x.on_time_pct, x.rating, x.ratings_count, (x.comments ?? []).join(" | ")]) },
    { title: "الأيام", head: ["اليوم", "الرحلات", "الالتزام %", "الغياب"], rows: r.days.map((x) => [x.day, x.trips, x.on_time_pct, x.absences]) },
  ]);
  const t = r?.totals;
  return <>
    <div className="welcome"><div><p className="eyebrow">التقارير</p><h1>التقرير الشهري</h1><p>الالتزام بالمواعيد والغياب والتنبيهات وتقييم السائقين لشهر واحد.</p></div>
      <div className="report-actions"><input type="month" aria-label="الشهر" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} /><Button disabled={!r} onClick={exportIt}><Download /> تصدير Excel</Button></div></div>
    {err && <p className="save-strip ops-message ops-error"><X /><span>{err}</span></p>}
    {t && <section className="report-tiles">
      <Tile label="الرحلات" value={num(t.trips)} /><Tile label="الالتزام بالموعد" value={pct(t.on_time_pct)} tone={t.on_time_pct == null ? undefined : t.on_time_pct >= 90 ? "good" : t.on_time_pct >= 75 ? "warn" : "bad"} />
      <Tile label="متوسط التأخر" value={t.avg_delay_min == null ? "—" : `${t.avg_delay_min} د`} /><Tile label="الغياب" value={num(t.absences)} />
      <Tile label="تنبيهات المسار" value={num(t.alerts)} tone={t.alerts ? "warn" : undefined} /><Tile label="البلاغات" value={num(t.emergencies)} tone={t.emergencies ? "bad" : undefined} />
      <Tile label="ملاحظات فحص الباص" value={num(t.vehicle_issues)} tone={t.vehicle_issues ? "warn" : undefined} /><Tile label="تقييم السائقين" value={t.driver_rating == null ? "—" : `${t.driver_rating} / 5`} />
    </section>}
    {r && <article className="panel ops-panel"><div className="panel-head"><div><p className="eyebrow">حسب المسار</p><h2>المسارات</h2></div><BarChart3 className="title-icon" /></div>
      <div className="table-wrap"><table className="report-table"><thead><tr><th>المسار</th><th>الرحلات</th><th>المكتملة</th><th>الالتزام</th><th>متوسط التأخر</th><th>الغياب</th></tr></thead>
        <tbody>{r.routes.length === 0 ? <tr><td colSpan={6}>لا توجد رحلات في هذا الشهر.</td></tr> : r.routes.map((x) => <tr key={x.route}><td>{x.route}</td><td>{x.trips}</td><td>{x.completed}</td><td>{pct(x.on_time_pct)}</td><td>{x.avg_delay_min ?? "—"}</td><td>{x.absences}</td></tr>)}</tbody></table></div></article>}
    {r && <article className="panel ops-panel"><div className="panel-head"><div><p className="eyebrow">حسب السائق</p><h2>السائقون</h2></div><Star className="title-icon" /></div>
      <div className="table-wrap"><table className="report-table"><thead><tr><th>السائق</th><th>رحلات مكتملة</th><th>الالتزام</th><th>تقييم أولياء الأمور</th><th>ملاحظات</th></tr></thead>
        <tbody>{r.drivers.map((x) => <tr key={x.driver}><td>{x.driver}</td><td>{x.trips}</td><td>{pct(x.on_time_pct)}</td><td>{x.rating == null ? "—" : `${x.rating} ★ (${x.ratings_count})`}</td><td className="wrap">{(x.comments ?? []).join(" · ") || "—"}</td></tr>)}</tbody></table></div></article>}
  </>;
}

type RegionRow = { school_id: string; school_name: string; region: string | null; trips: number; completed: number; on_time_pct: number | null; absences: number; alerts: number; emergencies: number; vehicle_issues: number; driver_rating: number | null };
export function RegionReport() {
  const [month, setMonth] = useState(thisMonth());
  const [rows, setRows] = useState<RegionRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => { const { data } = await supabase.rpc("region_monthly_report", { p_month: `${month}-01` }); if (alive) setRows((data ?? []) as RegionRow[]); })().catch(() => setRows([]));
    return () => { alive = false; };
  }, [month]);
  const exportIt = () => rows && downloadCsv(`مساري-تقرير-المنطقة-${month}`, [{ title: `تقرير المدارس — ${month}`, head: ["المدرسة", "المنطقة", "الرحلات", "المكتملة", "الالتزام %", "الغياب", "تنبيهات المسار", "البلاغات", "ملاحظات الفحص", "تقييم السائقين"],
    rows: rows.map((x) => [x.school_name, x.region, x.trips, x.completed, x.on_time_pct, x.absences, x.alerts, x.emergencies, x.vehicle_issues, x.driver_rating]) }]);
  const sum = (k: keyof RegionRow) => (rows ?? []).reduce((a, x) => a + (Number(x[k]) || 0), 0);
  return <>
    <div className="welcome"><div><p className="eyebrow">التقارير</p><h1>تقرير المدارس الشهري</h1><p>مقارنة المدارس في الالتزام والغياب والتنبيهات والسلامة.</p></div>
      <div className="report-actions"><input type="month" aria-label="الشهر" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} /><Button disabled={!rows?.length} onClick={exportIt}><Download /> تصدير Excel</Button></div></div>
    {rows && <section className="report-tiles"><Tile label="المدارس" value={String(rows.length)} /><Tile label="الرحلات" value={String(sum("trips"))} /><Tile label="الغياب" value={String(sum("absences"))} /><Tile label="البلاغات" value={String(sum("emergencies"))} tone={sum("emergencies") ? "bad" : undefined} /></section>}
    {rows && <article className="panel ops-panel"><div className="table-wrap"><table className="report-table"><thead><tr><th>المدرسة</th><th>الرحلات</th><th>الالتزام</th><th>الغياب</th><th>تنبيهات</th><th>بلاغات</th><th>فحص</th><th>التقييم</th></tr></thead>
      <tbody>{rows.length === 0 ? <tr><td colSpan={8}>لا توجد مدارس مفعّلة.</td></tr> : rows.map((x) => <tr key={x.school_id}><td>{x.school_name}</td><td>{x.trips}</td><td>{pct(x.on_time_pct)}</td><td>{x.absences}</td><td>{x.alerts}</td><td>{x.emergencies}</td><td>{x.vehicle_issues}</td><td>{x.driver_rating ?? "—"}</td></tr>)}</tbody></table></div></article>}
  </>;
}

// ───────── ولي الأمر: تقييم السائق شهريًا ─────────
type MyDriver = { driver_id: string; full_name: string; school_name: string; students: string; my_stars: number | null; my_comment: string | null };
function RateOne({ d, onSaved }: { d: MyDriver; onSaved: () => void }) {
  const [stars, setStars] = useState(d.my_stars ?? 0);
  const [comment, setComment] = useState(d.my_comment ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const save = async () => {
    setBusy(true); setMsg("");
    const row = { driver_id: d.driver_id, stars, comment: comment.trim() || null };
    const { error } = d.my_stars ? await supabase.from("driver_ratings").update(row).eq("driver_id", d.driver_id).eq("month", `${thisMonth()}-01`) : await supabase.from("driver_ratings").insert(row);
    setBusy(false);
    setMsg(error ? "تعذر حفظ التقييم." : "شكرًا، حُفظ تقييمك.");
    if (!error) onSaved();
  };
  return <div className="rate-driver">
    <div><strong>{d.full_name}</strong><p>{d.students} · {d.school_name}</p></div>
    <div className="stars" role="radiogroup" aria-label={`تقييم ${d.full_name}`}>{[1, 2, 3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={stars === n} aria-label={`${n} من 5`} className={n <= stars ? "on" : ""} onClick={() => setStars(n)}><Star /></button>)}</div>
    <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} placeholder="ملاحظة للمدرسة (اختياري)" aria-label="ملاحظة" />
    <Button size="sm" disabled={busy || !stars} onClick={() => void save()}><Check /> {d.my_stars ? "تحديث التقييم" : "إرسال التقييم"}</Button>
    {msg && <span className="muted-inline">{msg}</span>}
  </div>;
}
export function ParentDriverRating() {
  const [rows, setRows] = useState<MyDriver[] | null>(null);
  const load = useCallback(async () => { const { data } = await supabase.rpc("my_children_drivers"); setRows((data ?? []) as MyDriver[]); }, []);
  useEffect(() => { let alive = true; void (async () => { if (alive) await load().catch(() => setRows([])); })(); return () => { alive = false; }; }, [load]);
  if (!rows?.length) return null;
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">تقييم {thisMonth()}</p><h2>كيف كان السائق هذا الشهر؟</h2></div><Star className="title-icon" /></div>
    <p className="muted-label">تقييمك يصل للمدرسة فقط، ويمكنك تعديله حتى نهاية الشهر.</p>
    {rows.map((d) => <RateOne key={d.driver_id} d={d} onSaved={() => void load()} />)}
  </article>;
}
