"use client";

import { useEffect, useState } from "react";
import { CalendarDays, GraduationCap, IdCard, MessageSquareText, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentCard } from "./student-card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { SchoolFinder } from "./school-directory";

// صفحات مخصّصة لكل دور: أبناء ولي الأمر، سجل الرحلات (ولي الأمر والسائق)، وملاحظات أولياء الأمور (المدرسة).

const one = <T,>(v: T | T[] | null | undefined): T | null => Array.isArray(v) ? v[0] ?? null : v ?? null;
const directionText = (d?: string | null) => d === "to_home" ? "عودة" : "ذهاب";
const tripStatus: Record<string, [string, string]> = { scheduled: ["مجدولة", "tone-1"], ready: ["جاهزة", "tone-1"], in_progress: ["جارية", "tone-2"], paused: ["متوقفة", "tone-1"], completed: ["انتهت", "tone-0"], cancelled: ["ملغاة", "tone-1"], emergency: ["طارئ", "tone-1"] };
const studentTripStatus: Record<string, string> = { not_boarded: "لم يصعد بعد", waiting: "في المحطة", boarded: "صعد الباص", arrived_school: "وصل المدرسة", absent: "غائب", boarded_return: "صعد للعودة", dropped_home: "نزل عند المنزل", no_show: "لم يحضر", emergency: "حالة طارئة" };
const fmtDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "long", day: "numeric", month: "long" });
const fmtTime = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" }) : null;

// ───────── أبنائي ─────────
type Assignment = { status: string; routes: { name: string; direction: string; scheduled_time: string | null } | null; route_stops: { label: string } | null };
type Child = { id: string; full_name: string; grade: string | null; service_status: string; qr_token: string; schools: { name: string } | null; student_route_assignments: Assignment[] };

export function ParentChildren({ email }: { email: string }) {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [cardFor, setCardFor] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("students")
        .select("id,full_name,grade,service_status,qr_token,schools(name),student_route_assignments(status,routes(name,direction,scheduled_time),route_stops(label))")
        .order("full_name");
      if (alive) setChildren(((data ?? []) as unknown as Child[]).map((c) => ({ ...c, schools: one(c.schools), student_route_assignments: (c.student_route_assignments ?? []).map((a) => ({ ...a, routes: one(a.routes), route_stops: one(a.route_stops) })) })));
    })().catch(() => setChildren([]));
    return () => { alive = false; };
  }, []);
  return <>
    <div className="welcome"><div><p className="eyebrow">ولي الأمر</p><h1>أبنائي</h1><p>أبناؤك المسجلون في النقل، ومسار كل واحد ومحطته.</p></div></div>
    {children && children.length === 0 && <article className="panel ops-panel"><p className="muted-label">لا يوجد أبناء مرتبطون بحسابك بعد. سجّل ابنك من الأسفل.</p></article>}
    <div className="children-grid">{children?.map((c) => {
      const active = c.student_route_assignments.filter((a) => a.status === "active" && a.routes);
      return <article className="panel child-tile" key={c.id}>
        <div className="child-tile-head"><span className="student-avatar">{c.full_name.charAt(0)}</span><div><strong>{c.full_name}</strong><p>{[c.grade, c.schools?.name].filter(Boolean).join(" · ")}</p></div>
          <Badge className={`status-badge ${c.service_status === "active" ? "tone-0" : "tone-1"}`}>{c.service_status === "active" ? "مشترك في النقل" : "متوقف"}</Badge></div>
        {active.length === 0 ? <p className="muted-label">لم تحدد المدرسة مسار ابنك بعد.</p>
          : active.map((a, i) => <p className="child-route" key={i}><GraduationCap className="inline-icon" /> {directionText(a.routes?.direction)}: {a.routes?.name}{a.routes?.scheduled_time ? ` · ${a.routes.scheduled_time.slice(0, 5)}` : ""}{a.route_stops ? ` · محطة ${a.route_stops.label}` : ""}</p>)}
        <Button size="sm" variant="outline" onClick={() => setCardFor(cardFor === c.id ? null : c.id)}><IdCard /> {cardFor === c.id ? "إخفاء البطاقة" : "بطاقة الطالب"}</Button>
        {cardFor === c.id && <StudentCard student={{ id: c.id, full_name: c.full_name, grade: c.grade, qr_token: c.qr_token, route: active.find((a) => a.routes?.direction === "to_school")?.routes?.name ?? null, stop: active.find((a) => a.routes?.direction === "to_school")?.route_stops?.label ?? null }} schoolName={c.schools?.name ?? ""} />}
      </article>;
    })}</div>
    <section className="parent-add-child"><h2>تسجيل ابن آخر في النقل</h2><SchoolFinder email={email} /></section>
  </>;
}

// ───────── سجل الرحلات ─────────
type HistoryRow = { key: string; date: string; direction: string; route: string; status: string; started: string | null; completed: string | null; detail: string };

export function TripHistory({ role }: { role: "parent" | "driver" }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      let out: HistoryRow[] = [];
      if (role === "driver") {
        const { data } = await supabase.from("trips").select("id,trip_date,direction,status,started_at,completed_at,routes(name),trip_students(status)").order("trip_date", { ascending: false }).order("direction").limit(60);
        out = ((data ?? []) as unknown as { id: string; trip_date: string; direction: string; status: string; started_at: string | null; completed_at: string | null; routes: { name: string } | { name: string }[] | null; trip_students: { status: string }[] }[]).map((t) => {
          const total = t.trip_students?.length ?? 0; const absent = t.trip_students?.filter((s) => s.status === "absent" || s.status === "no_show").length ?? 0;
          return { key: t.id, date: t.trip_date, direction: t.direction, route: one(t.routes)?.name ?? "مسار", status: t.status, started: t.started_at, completed: t.completed_at, detail: total ? `${total - absent} من ${total} طالب` : "بلا طلاب" };
        });
      } else {
        const { data } = await supabase.from("trip_students").select("id,status,students(full_name),trips(trip_date,direction,status,started_at,completed_at,routes(name))").order("created_at", { ascending: false }).limit(60);
        type TS = { id: string; status: string; students: { full_name: string } | { full_name: string }[] | null; trips: { trip_date: string; direction: string; status: string; started_at: string | null; completed_at: string | null; routes: { name: string } | { name: string }[] | null } | { trip_date: string; direction: string; status: string; started_at: string | null; completed_at: string | null; routes: { name: string } | { name: string }[] | null }[] | null };
        out = ((data ?? []) as unknown as TS[]).flatMap((r) => {
          const t = one(r.trips); if (!t) return [];
          return [{ key: r.id, date: t.trip_date, direction: t.direction, route: one(t.routes)?.name ?? "مسار", status: t.status, started: t.started_at, completed: t.completed_at, detail: `${one(r.students)?.full_name ?? "ابنك"}: ${studentTripStatus[r.status] ?? r.status}` }];
        }).sort((a, b) => b.date.localeCompare(a.date));
      }
      if (alive) setRows(out);
    })().catch(() => setRows([]));
    return () => { alive = false; };
  }, [role]);
  const byDate = (rows ?? []).reduce<Record<string, HistoryRow[]>>((acc, r) => { (acc[r.date] ??= []).push(r); return acc; }, {});
  return <>
    <div className="welcome"><div><p className="eyebrow">{role === "driver" ? "السائق" : "ولي الأمر"}</p><h1>سجل الرحلات</h1><p>{role === "driver" ? "رحلاتك السابقة وعدد الطلاب الذين نقلتهم." : "رحلات أبنائك وحالة كل واحد فيها."}</p></div></div>
    {rows && rows.length === 0 && <article className="panel ops-panel"><p className="muted-label">لا توجد رحلات بعد.</p></article>}
    {Object.entries(byDate).map(([date, list]) => <article className="panel ops-panel" key={date}>
      <div className="panel-head"><div><p className="eyebrow"><CalendarDays className="inline-icon" /> {fmtDate(date)}</p></div></div>
      {list.map((r) => <div className="ops-row" key={r.key}><div><strong>{directionText(r.direction)} · {r.route}</strong><p>{[r.detail, fmtTime(r.started) && `بدأت ${fmtTime(r.started)}`, fmtTime(r.completed) && `انتهت ${fmtTime(r.completed)}`].filter(Boolean).join(" · ")}</p></div>
        <Badge className={`status-badge ${tripStatus[r.status]?.[1] ?? "tone-1"}`}>{tripStatus[r.status]?.[0] ?? r.status}</Badge></div>)}
    </article>)}
  </>;
}

// ───────── ملاحظات أولياء الأمور (المدرسة) ─────────
type Feedback = { id: string; author_name: string | null; rating: number; category: string | null; message: string | null; created_at: string };

export function FeedbackList() {
  const [rows, setRows] = useState<Feedback[] | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.from("ratings_feedback").select("id,author_name,rating,category,message,created_at").order("created_at", { ascending: false }).limit(100);
      if (alive) setRows((data ?? []) as Feedback[]);
    })().catch(() => setRows([]));
    return () => { alive = false; };
  }, []);
  const avg = rows?.length ? (rows.reduce((a, r) => a + r.rating, 0) / rows.length).toFixed(1) : null;
  return <>
    <div className="welcome"><div><p className="eyebrow">إدارة المدرسة</p><h1>ملاحظات أولياء الأمور</h1><p>تقييمات أولياء الأمور وملاحظاتهم على الرحلات.{avg ? ` متوسط التقييم ${avg} من 5.` : ""}</p></div></div>
    <article className="panel ops-panel">
      {rows && rows.length === 0 && <p className="muted-label">لا توجد ملاحظات بعد.</p>}
      {rows?.map((r) => <div className="ops-row" key={r.id}><div><strong><MessageSquareText className="inline-icon" /> {r.category ?? "ملاحظة"} · {r.author_name ?? "ولي أمر"}</strong><p>{r.message}</p><p>{new Date(r.created_at).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" })}</p></div>
        <span className="rating-stars" aria-label={`${r.rating} من 5`}>{Array.from({ length: 5 }, (_, i) => <Star key={i} className={i < r.rating ? "on" : ""} />)}</span></div>)}
    </article>
  </>;
}
