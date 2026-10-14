"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, IdCard, Plus, Printer, RotateCcw, Search, X } from "lucide-react";
import { CardsSheet, type CardStudent } from "./student-card";
import { RoutePlanner } from "./route-planner-ui";
import { RouteCard } from "./route-editor";
import { TripActual, riyadhWeekday } from "./route-tools";
import { HomeLocationRequests } from "./home-location";
import { StudentImport } from "./student-import-ui";
import { TodayChecks } from "./safety";
import { BusCare, DriverLicense, StudentAvatar, HolidaysPanel, StudentPhotoButton, blockerText, busDocsBadge, useHolidays, usePhotoUrls } from "./school-extras";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

// التشغيل اليومي للمدرسة: كل ما يلزم قبل أن يبدأ السائق رحلته.
// الصلاحيات تفرضها سياسات RLS ودوال الخادم؛ الواجهة تعرض النتيجة فقط.

export type OpsTab = "requests" | "fleet" | "routes" | "students" | "trips";
type StudentRequest = { id: string; student_name: string; grade: string | null; parent_name: string | null; parent_phone: string | null; parent_email: string | null; status: string; student_national_id: string | null; home_address: string | null; home_latitude: number | null; home_longitude: number | null; note: string | null; created_by: string | null };
type DriverRequest = { id: string; driver_name: string; phone: string | null; email: string | null; vehicle_plate: string | null };
type Driver = { id: string; full_name: string; status: string; user_id: string | null; license_expiry?: string | null };
type Bus = { id: string; bus_number: string; plate_number: string; capacity: number; driver_id: string | null; status?: string; registration_expiry?: string | null; insurance_expiry?: string | null; inspection_expiry?: string | null; next_service_on?: string | null };
type Stop = { id: string; stop_order: number; label: string; stop_type: string; latitude: number | null; longitude: number | null; scheduled_time: string | null; radius_m?: number | null };
type RouteRow = { id: string; name: string; direction: string; scheduled_time: string | null; estimated_duration_minutes: number | null; is_active: boolean; archived_at: string | null; days: number[] | null; bus_id: string | null; driver_id: string | null; route_stops: Stop[] };
type Assignment = { id: string; route_id: string; stop_id: string | null };
type Student = { id: string; full_name: string; grade: string | null; service_status: string; qr_token: string; photo_path?: string | null; home_latitude: number | null; home_longitude: number | null; student_route_assignments: Assignment[] };
type Trip = { id: string; route_id: string; status: string; driver_id: string | null };

const riyadhToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const directionLabel = (d: string) => d === "to_home" ? "إلى المنزل" : "إلى المدرسة";
const routeReasonText: Record<string, string> = {
  NO_DRIVER: "بلا سائق", NO_BUS: "بلا باص", NOT_ENOUGH_STOPS: "محطات غير كافية", STOP_HAS_NO_LOCATION: "محطة بلا موقع",
  NO_STUDENTS: "لا طلاب مسندين", DRIVER_OR_BUS_BUSY: "للسائق أو الباص رحلة أخرى اليوم بنفس الاتجاه", ROUTE_INACTIVE: "المسار غير نشط",
};
const tripStatusLabel: Record<string, string> = { scheduled: "مجدولة", ready: "جاهزة", in_progress: "جارية", paused: "متوقفة", completed: "انتهت", cancelled: "ملغاة", emergency: "طارئ" };
const errorText = (error: { message?: string; code?: string } | null) => {
  const m = error?.message ?? "";
  const blocker = Object.keys(blockerText).find((k) => m.includes(k));
  if (blocker) return blockerText[blocker];
  if (m.includes("SCHOOL_NOT_ACTIVE")) return "المدرسة موقوفة أو غير مفعّلة، فلا يمكن تعديل تشغيلها. تواصل مع إدارة مساري.";
  if (m.includes("DUPLICATE_STUDENT")) return "الطالب مسجل مسبقًا.";
  if (m.includes("DUPLICATE_DRIVER")) return "السائق مسجل مسبقًا.";
  if (m.includes("ALREADY_REVIEWED")) return "تمت مراجعة هذا الطلب مسبقًا.";
  if (m.includes("REASON_REQUIRED")) return "سبب الرفض مطلوب.";
  if (m.includes("BUS_CAPACITY_EXCEEDED")) return "عدد الطلاب في المسار أكبر من مقاعد الباص.";
  if (m.includes("STOP_NOT_IN_ROUTE")) return "المحطة ليست من محطات هذا المسار.";
  if (m.includes("ROUTE_HAS_TRIPS")) return "للمسار رحلات مسجلة، فلا يمكن حذفه. أرشفه بدلًا من ذلك.";
  if (m.includes("trips_driver_day")) return "للسائق رحلة أخرى اليوم بنفس الاتجاه.";
  if (m.includes("trips_bus_day")) return "للباص رحلة أخرى اليوم بنفس الاتجاه.";
  if (error?.code === "23505") return "يوجد سجل بنفس البيانات.";
  if (error?.code === "42501") return "ليست لديك صلاحية لهذا الإجراء.";
  return "تعذر الحفظ. حاول مرة أخرى.";
};
// البحث بالعربي لا يتأثر بالهمزات والتاء المربوطة والتشكيل: «احمد» تطابق «أحمد»
const arabicKey = (s: string) => s.trim().toLowerCase().replace(/[\u064B-\u0652\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, " ");
const PAGE = 50;
// يقبل الإحداثيات كما تُنسخ من خرائط Google: "24.7501, 46.8001"
const parseLatLng = (text: string): { lat: number; lng: number } | null => {
  const parts = text.split(/[,،\s]+/).filter(Boolean).map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lat, lng] = parts;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
};

const TAB_TITLES: Record<OpsTab, [string, string]> = {
  requests: ["الطلبات", "إضافة الطلاب والسائقين، واعتماد طلبات أولياء الأمور والسائقين."],
  students: ["الطلاب", "كل طلاب المدرسة، وإسناد كل طالب إلى مساره ومحطته."],
  fleet: ["الباصات والسائقون", "الباصات وسائق كل باص."],
  routes: ["المسارات", "مسارات الذهاب والعودة ومحطاتها على الخريطة."],
  trips: ["رحلات اليوم", "إنشاء رحلات اليوم لكل مسار جاهز ومتابعة حالتها."],
};

export function SchoolOps({ schoolId, tab, isAdmin = true }: { schoolId: string; tab: OpsTab; isAdmin?: boolean }) {
  const [schoolPoint, setSchoolPoint] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const [schoolName, setSchoolName] = useState("");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [studentRequests, setStudentRequests] = useState<StudentRequest[]>([]);
  const [driverRequests, setDriverRequests] = useState<DriverRequest[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [autoTrips, setAutoTrips] = useState(true);

  const load = useCallback(async () => {
    const [sc, sr, dr, dv, bs, rt, st, tr, auto] = await Promise.all([
      supabase.from("schools").select("name,latitude,longitude").eq("id", schoolId).single(),
      supabase.from("student_onboarding_requests").select("id,student_name,grade,parent_name,parent_phone,parent_email,status,student_national_id,home_address,home_latitude,home_longitude,note,created_by").eq("school_id", schoolId).in("status", ["pending", "pending_parent_account"]).order("created_at"),
      supabase.from("driver_onboarding_requests").select("id,driver_name,phone,email,vehicle_plate").eq("school_id", schoolId).eq("status", "pending").order("created_at"),
      supabase.from("drivers").select("id,full_name,status,user_id,license_expiry").eq("school_id", schoolId).order("full_name"),
      supabase.from("buses").select("id,bus_number,plate_number,capacity,driver_id,status,registration_expiry,insurance_expiry,inspection_expiry,next_service_on").eq("school_id", schoolId).order("bus_number"),
      supabase.from("routes").select("id,name,direction,scheduled_time,estimated_duration_minutes,is_active,archived_at,days,bus_id,driver_id,route_stops(id,stop_order,label,stop_type,latitude,longitude,scheduled_time,radius_m)").eq("school_id", schoolId).order("name"),
      supabase.from("students").select("id,full_name,grade,service_status,qr_token,photo_path,home_latitude,home_longitude,student_route_assignments(id,route_id,stop_id)").eq("school_id", schoolId).order("full_name"),
      supabase.from("trips").select("id,route_id,status,driver_id").eq("school_id", schoolId).eq("trip_date", riyadhToday()),
      // استعلام منفصل: إن لم يُطبَّق الترحيل بعد لا يتعطل تحميل بيانات المدرسة
      supabase.from("schools").select("auto_daily_trips").eq("id", schoolId).maybeSingle(),
    ]);
    setSchoolPoint({ lat: sc.data?.latitude ?? null, lng: sc.data?.longitude ?? null });
    setSchoolName(sc.data?.name ?? "");
    setAutoTrips(auto.data?.auto_daily_trips ?? true);
    setStudentRequests(sr.data ?? []);
    setDriverRequests(dr.data ?? []);
    setDrivers(dv.data ?? []);
    setBuses(bs.data ?? []);
    setRoutes((rt.data ?? []).map((r) => ({ ...r, route_stops: [...(r.route_stops ?? [])].sort((a, b) => a.stop_order - b.stop_order) })));
    setStudents(st.data ?? []);
    setTrips(tr.data ?? []);
  }, [schoolId]);

  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [load]);

  // كل عملية: تنفيذ ثم إعادة تحميل ثم رسالة واضحة.
  const act: Act = async (fn, ok) => {
    setBusy(true); setMessage(null);
    try {
      const { error, data } = await fn();
      if (error) { setMessage({ text: errorText(error), ok: false }); return false; }
      await load();
      setMessage(typeof ok === "string" ? { text: ok, ok: true } : ok(data));
      return true;
    } finally { setBusy(false); }
  };


  return <>
    <div className="welcome"><div><p className="eyebrow">إدارة المدرسة</p><h1>{TAB_TITLES[tab][0]}</h1><p>{TAB_TITLES[tab][1]}</p></div></div>
    {message && <p className={`save-strip ops-message ${message.ok ? "" : "ops-error"}`}>{message.ok ? <Check /> : <X />}<span>{message.text}</span></p>}
    {tab === "requests" && <RequestsTab schoolId={schoolId} reload={load} setMessage={setMessage} studentRequests={studentRequests} driverRequests={driverRequests} busy={busy} act={act} />}
    {tab === "requests" && <HomeLocationRequests schoolId={schoolId} onDone={(text) => setMessage({ text, ok: true })} />}
    {tab === "fleet" && <FleetTab schoolId={schoolId} buses={buses} drivers={drivers} busy={busy} act={act} reload={load} />}
    {tab === "routes" && <RoutesTab isAdmin={isAdmin} schoolName={schoolName} schoolId={schoolId} schoolLat={schoolPoint.lat} schoolLng={schoolPoint.lng} routes={routes} buses={buses} drivers={drivers} students={students} busy={busy} act={act} />}
    {tab === "students" && <StudentsTab schoolId={schoolId} setMessage={setMessage} reload={load} students={students} routes={routes} schoolName={schoolName} busy={busy} act={act} />}
    {tab === "trips" && <TripsTab schoolId={schoolId} autoTrips={autoTrips} routes={routes} trips={trips} drivers={drivers} buses={buses} students={students} busy={busy} act={act} />}
    {tab === "trips" && <TodayChecks schoolId={schoolId} />}
    {tab === "trips" && <HolidaysPanel schoolId={schoolId} canEdit onChange={() => void load()} />}
  </>;
}

type Act = (fn: () => PromiseLike<{ error: { message?: string; code?: string } | null; data?: unknown }>, ok: string | ((data: unknown) => { text: string; ok: boolean })) => Promise<boolean>;

// إضافة طالب أو سائق بالبريد: يُنشأ طلب يُعتمد أدناه، ويُربط الحساب عند تسجيل صاحبه بنفس البريد.
function AddForms({ schoolId, busy, act }: { schoolId: string; busy: boolean; act: Act }) {
  const [open, setOpen] = useState<"" | "student" | "driver">("");
  const [st, setSt] = useState({ name: "", grade: "", parentName: "", parentPhone: "", parentEmail: "", address: "" });
  const [dr, setDr] = useState({ name: "", phone: "", email: "", plate: "" });
  const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const stOk = st.name.trim().length >= 3 && st.parentPhone.trim().length >= 9 && email.test(st.parentEmail.trim());
  const drOk = dr.name.trim().length >= 3 && dr.phone.trim().length >= 9 && email.test(dr.email.trim());
  const addStudent = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const ok = await act(() => supabase.from("student_onboarding_requests").insert({
      school_id: schoolId, created_by: auth.user?.id, status: "pending_parent_account", student_name: st.name.trim(), grade: st.grade.trim() || null,
      parent_name: st.parentName.trim() || null, parent_phone: st.parentPhone.trim(), parent_email: st.parentEmail.trim().toLowerCase(), home_address: st.address.trim() || null,
    }), `أُضيف طلب ${st.name.trim()}. اعتمده أدناه، ويُربط ولي الأمر عند تسجيله بالبريد ${st.parentEmail.trim()}.`);
    if (ok) { setSt({ name: "", grade: "", parentName: "", parentPhone: "", parentEmail: "", address: "" }); setOpen(""); }
  };
  const addDriver = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const ok = await act(() => supabase.from("driver_onboarding_requests").insert({
      school_id: schoolId, created_by: auth.user?.id, status: "pending", driver_name: dr.name.trim(), phone: dr.phone.trim(),
      email: dr.email.trim().toLowerCase(), vehicle_plate: dr.plate.trim() || null,
    }), `أُضيف طلب السائق ${dr.name.trim()}. اعتمده أدناه، ويُربط حسابه عند تسجيله بالبريد ${dr.email.trim()}.`);
    if (ok) { setDr({ name: "", phone: "", email: "", plate: "" }); setOpen(""); }
  };
  return <article className="panel ops-panel">
    <div className="ops-actions"><Button variant={open === "student" ? "default" : "outline"} onClick={() => setOpen(open === "student" ? "" : "student")}><Plus /> إضافة طالب</Button><Button variant={open === "driver" ? "default" : "outline"} onClick={() => setOpen(open === "driver" ? "" : "driver")}><Plus /> إضافة سائق</Button></div>
    {open === "student" && <div className="dir-tool"><div className="claim-grid">
      <label htmlFor="as-name">اسم الطالب<input id="as-name" value={st.name} onChange={(e) => setSt({ ...st, name: e.target.value })} /></label>
      <label htmlFor="as-grade">الصف<input id="as-grade" value={st.grade} onChange={(e) => setSt({ ...st, grade: e.target.value })} /></label>
      <label htmlFor="as-pname">اسم ولي الأمر<input id="as-pname" value={st.parentName} onChange={(e) => setSt({ ...st, parentName: e.target.value })} /></label>
      <label htmlFor="as-pphone">جوال ولي الأمر<input id="as-pphone" dir="ltr" inputMode="tel" value={st.parentPhone} onChange={(e) => setSt({ ...st, parentPhone: e.target.value })} placeholder="05xxxxxxxx" /></label>
      <label htmlFor="as-pemail">بريد ولي الأمر<input id="as-pemail" dir="ltr" type="email" value={st.parentEmail} onChange={(e) => setSt({ ...st, parentEmail: e.target.value })} /></label>
      <label htmlFor="as-addr">عنوان المنزل<input id="as-addr" value={st.address} onChange={(e) => setSt({ ...st, address: e.target.value })} /></label>
    </div><Button disabled={busy || !stOk} onClick={() => void addStudent()}>حفظ طلب الطالب</Button></div>}
    {open === "driver" && <div className="dir-tool"><div className="claim-grid">
      <label htmlFor="ad-name">اسم السائق<input id="ad-name" value={dr.name} onChange={(e) => setDr({ ...dr, name: e.target.value })} /></label>
      <label htmlFor="ad-phone">الجوال<input id="ad-phone" dir="ltr" inputMode="tel" value={dr.phone} onChange={(e) => setDr({ ...dr, phone: e.target.value })} placeholder="05xxxxxxxx" /></label>
      <label htmlFor="ad-email">البريد<input id="ad-email" dir="ltr" type="email" value={dr.email} onChange={(e) => setDr({ ...dr, email: e.target.value })} /></label>
      <label htmlFor="ad-plate">لوحة الباص (اختياري)<input id="ad-plate" value={dr.plate} onChange={(e) => setDr({ ...dr, plate: e.target.value })} /></label>
    </div><Button disabled={busy || !drOk} onClick={() => void addDriver()}>حفظ طلب السائق</Button></div>}
  </article>;
}

function RequestsTab({ schoolId, reload, setMessage, studentRequests, driverRequests, busy, act }: { schoolId: string; reload: () => Promise<void>; setMessage: (m: { text: string; ok: boolean } | null) => void; studentRequests: StudentRequest[]; driverRequests: DriverRequest[]; busy: boolean; act: Act }) {
  const reject = (kind: "student" | "driver", id: string) => {
    const note = window.prompt("سبب الرفض:");
    if (!note?.trim()) return;
    void act(() => supabase.rpc(kind === "student" ? "review_student_request" : "review_driver_request", { p_request: id, p_approve: false, p_note: note.trim() }), "تم رفض الطلب.");
  };
  const approveAll = () => {
    if (!window.confirm(`اعتماد كل طلبات الطلاب (${studentRequests.length})؟ راجع البيانات قبل الاعتماد.`)) return;
    void act(() => supabase.rpc("approve_student_requests", { p_ids: studentRequests.map((r) => r.id) }), (data) => {
      const res = data as { approved: number; errors: { id: string; error: string }[] };
      if (!res.errors.length) return { text: `تم اعتماد ${res.approved} طالبًا.`, ok: true };
      const names = res.errors.map((e) => `${studentRequests.find((r) => r.id === e.id)?.student_name ?? "طلب"}: ${errorText({ message: e.error })}`);
      return { text: `اعتُمد ${res.approved}، وتعذر ${res.errors.length}: ${names.join(" — ")}`, ok: false };
    });
  };
  return <>
    <AddForms schoolId={schoolId} busy={busy} act={act} />
    <StudentImport schoolId={schoolId} onDone={(text, ok) => { setMessage({ text, ok }); void reload(); }} />
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">بانتظار الاعتماد</p><h2>طلبات الطلاب</h2></div>
        {studentRequests.length > 1 && <Button size="sm" variant="outline" disabled={busy} onClick={approveAll}><Check /> اعتماد الكل ({studentRequests.length})</Button>}</div>
      {studentRequests.length === 0 && <p className="muted-label">لا توجد طلبات طلاب جديدة.</p>}
      {studentRequests.map((r) => <div className="ops-row" key={r.id}>
        <div><strong>{r.student_name}</strong>{r.status === "pending" && r.home_latitude != null && <Badge className="status-badge tone-2 req-badge">طلب من ولي الأمر</Badge>}<p>{[r.grade, r.student_national_id && `الهوية: ${r.student_national_id}`, r.parent_name && `ولي الأمر: ${r.parent_name}`, r.parent_phone, r.parent_email].filter(Boolean).join(" · ")}</p>{(r.home_address || r.home_latitude != null) && <p>{r.home_address ?? "المنزل"}{r.home_latitude != null && r.home_longitude != null && <> · <a className="dir-map-link" href={`https://www.openstreetmap.org/?mlat=${r.home_latitude}&mlon=${r.home_longitude}#map=17/${r.home_latitude}/${r.home_longitude}`} target="_blank" rel="noreferrer">موقع المنزل على الخريطة</a></>}</p>}{r.note && <p>ملاحظة: {r.note}</p>}</div>
        <div className="ops-actions">
          <Button size="sm" disabled={busy} onClick={() => void act(() => supabase.rpc("review_student_request", { p_request: r.id, p_approve: true }), r.home_latitude != null ? `تم اعتماد ${r.student_name} وربطه بحساب ولي أمره. حدّد له المسار والمحطة من «إسناد الطلاب».` : `تم اعتماد ${r.student_name}. سيُربط حساب ولي الأمر تلقائيًا عند تسجيله بنفس البريد.`)}>اعتماد</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => reject("student", r.id)}>رفض</Button>
        </div>
      </div>)}
    </article>
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">بانتظار الاعتماد</p><h2>طلبات السائقين</h2></div></div>
      {driverRequests.length === 0 && <p className="muted-label">لا توجد طلبات سائقين جديدة.</p>}
      {driverRequests.map((r) => <div className="ops-row" key={r.id}>
        <div><strong>{r.driver_name}</strong><p>{[r.phone, r.email, r.vehicle_plate && `لوحة: ${r.vehicle_plate}`].filter(Boolean).join(" · ")}</p></div>
        <div className="ops-actions">
          <Button size="sm" disabled={busy} onClick={() => void act(() => supabase.rpc("review_driver_request", { p_request: r.id, p_approve: true }), `تم اعتماد ${r.driver_name}. سيُربط حسابه تلقائيًا عند تسجيله بنفس البريد.`)}>اعتماد</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => reject("driver", r.id)}>رفض</Button>
        </div>
      </div>)}
    </article>
  </>;
}

function FleetTab({ schoolId, buses, drivers, busy, act, reload }: { schoolId: string; buses: Bus[]; drivers: Driver[]; busy: boolean; act: Act; reload: () => Promise<void> }) {
  const [careFor, setCareFor] = useState<string | null>(null);
  const [form, setForm] = useState({ number: "", plate: "", capacity: "20" });
  const capacity = Number(form.capacity);
  const canAdd = form.number.trim() && form.plate.trim() && Number.isInteger(capacity) && capacity > 0;
  const add = async () => {
    const ok = await act(() => supabase.from("buses").insert({ school_id: schoolId, bus_number: form.number.trim(), plate_number: form.plate.trim(), capacity }), "تمت إضافة الباص.");
    if (ok) setForm({ number: "", plate: "", capacity: "20" });
  };
  const activeDrivers = drivers.filter((d) => d.status === "active");
  return <>
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">الأسطول</p><h2>الباصات وسائقوها</h2></div></div>
      {buses.length === 0 && <p className="muted-label">لا توجد باصات بعد.</p>}
      {buses.map((bus) => { const badge = busDocsBadge(bus); return <div className="ops-row ops-bus" key={bus.id}>
        <div><strong>باص {bus.bus_number}</strong><p>{bus.plate_number} · {bus.capacity} مقعدًا</p>{badge && <Badge className={`status-badge ${badge.tone}`}>{badge.text}</Badge>}</div>
        <label className="ops-select">السائق<select value={bus.driver_id ?? ""} disabled={busy} onChange={(e) => void act(() => supabase.from("buses").update({ driver_id: e.target.value || null }).eq("id", bus.id), "تم تحديث سائق الباص.")}>
          <option value="">— بلا سائق —</option>{activeDrivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
        </select></label>
        <Button size="sm" variant="outline" onClick={() => setCareFor(careFor === bus.id ? null : bus.id)}>{careFor === bus.id ? "إغلاق" : "الوثائق والصيانة"}</Button>
        {careFor === bus.id && <BusCare bus={bus} schoolId={schoolId} canEdit onSaved={() => void reload()} />}
      </div>; })}
    </article>
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">الأسطول</p><h2>إضافة باص</h2></div></div>
      <div className="driver-form">
        <label>رقم الباص<input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="مثال: 3" /></label>
        <label>رقم اللوحة<input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="أ ب ج 1234" /></label>
        <label>عدد المقاعد<input value={form.capacity} inputMode="numeric" onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label>
      </div>
      <Button className="wide-action" disabled={!canAdd || busy} onClick={() => void add()}><Plus /> إضافة الباص</Button>
    </article>
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">السائقون</p><h2>سائقو المدرسة</h2></div></div>
      {drivers.length === 0 && <p className="muted-label">لا يوجد سائقون بعد. أضف سائقًا من «الأسطول والسائقون» ثم اعتمده من «الطلبات».</p>}
      {drivers.map((d) => <div className="ops-row" key={d.id}><div><strong>{d.full_name}</strong><p>{d.user_id ? "الحساب مربوط" : "بانتظار تسجيل السائق بنفس البريد"}</p></div><DriverLicense driverId={d.id} value={d.license_expiry ?? null} canEdit onSaved={() => void reload()} /><Badge className="status-badge tone-2">{d.status === "active" ? "معتمد" : d.status === "pending" ? "قيد المراجعة" : "موقوف"}</Badge></div>)}
    </article>
  </>;
}

function RoutesTab({ schoolName, schoolId, schoolLat, schoolLng, routes, buses, drivers, students, busy, act, isAdmin }: { schoolId: string; schoolLat: number | null; schoolLng: number | null; routes: RouteRow[]; buses: Bus[]; drivers: Driver[]; students: Student[]; busy: boolean; act: Act; isAdmin: boolean; schoolName: string }) {
  const [showArchived, setShowArchived] = useState(false);
  const live = routes.filter((r) => !r.archived_at);
  const archived = routes.filter((r) => r.archived_at);
  const toSchool = new Set(live.filter((r) => r.is_active && r.direction === "to_school").map((r) => r.id));
  const unassigned = students.filter((st) => st.service_status === "active" && !st.student_route_assignments.some((a) => toSchool.has(a.route_id)));
  const plannable = unassigned.filter((st) => st.home_latitude != null && st.home_longitude != null).map((st) => ({ id: st.id, name: st.full_name, lat: st.home_latitude!, lng: st.home_longitude! }));
  const countOn = (routeId: string) => students.filter((st) => st.student_route_assignments.some((a) => a.route_id === routeId)).length;
  const atStop = (stopId: string) => students.filter((st) => st.student_route_assignments.some((a) => a.stop_id === stopId)).length;
  return <>
    <RoutePlanner schoolId={schoolId} school={schoolLat != null && schoolLng != null ? { lat: schoolLat, lng: schoolLng } : null} students={plannable} missingHome={unassigned.length - plannable.length} defaultCapacity={Math.max(0, ...buses.map((b) => b.capacity))} busy={busy} act={act} />
    {live.length === 0 && <article className="panel ops-panel"><p className="muted-label">لا توجد مسارات بعد. استخدم «اقتراح المسارات» أعلاه أو أنشئ مسارًا من النموذج أدناه.</p></article>}
    {live.map((route) => <RouteCard key={route.id} route={route} routes={routes} buses={buses} drivers={drivers} students={students} schoolName={schoolName} studentCount={countOn(route.id)} studentsAtStop={atStop} isAdmin={isAdmin} busy={busy} act={act} />)}
    <NewRouteForm schoolId={schoolId} schoolLat={schoolLat} schoolLng={schoolLng} busy={busy} act={act} />
    {archived.length > 0 && <button className="text-link archived-toggle" onClick={() => setShowArchived((v) => !v)}>{showArchived ? "إخفاء" : "عرض"} المسارات المؤرشفة ({archived.length})</button>}
    {showArchived && archived.map((route) => <RouteCard key={route.id} route={route} routes={routes} buses={buses} drivers={drivers} students={students} schoolName={schoolName} studentCount={countOn(route.id)} studentsAtStop={atStop} isAdmin={isAdmin} busy={busy} act={act} />)}
  </>;
}

function NewRouteForm({ schoolId, schoolLat, schoolLng, busy, act }: { schoolId: string; schoolLat: number | null; schoolLng: number | null; busy: boolean; act: Act }) {
  const empty = { name: "", direction: "to_school", time: "06:30", stops: "" };
  const [form, setForm] = useState(empty);
  // كل سطر: اسم المحطة | خط العرض, خط الطول
  const lines = form.stops.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [label, coords = ""] = line.split("|").map((part) => part.trim());
    return { label, point: parseLatLng(coords) };
  });
  const badLines = lines.filter((l) => !l.label || !l.point).length;
  const hasSchoolLocation = schoolLat != null && schoolLng != null;
  const canAdd = form.name.trim() && form.time && lines.length >= 1 && badLines === 0 && hasSchoolLocation;
  const add = async () => {
    const ok = await act(async () => {
      const { data: route, error } = await supabase.from("routes").insert({ school_id: schoolId, name: form.name.trim(), direction: form.direction, scheduled_time: form.time, estimated_duration_minutes: Math.max(lines.length * 10, 20) }).select("id").single();
      if (error || !route) return { error };
      // المدرسة آخر محطة في الذهاب وأول محطة في العودة
      const school = { label: "المدرسة", point: { lat: schoolLat!, lng: schoolLng! }, type: "school" };
      const homeStops = lines.map((l) => ({ ...l, type: form.direction === "to_home" ? "dropoff" : "pickup" }));
      const ordered = form.direction === "to_home" ? [school, ...homeStops] : [...homeStops, school];
      const { error: stopsError } = await supabase.from("route_stops").insert(ordered.map((s, i) => ({ route_id: route.id, stop_order: i + 1, label: s.label, stop_type: s.type, latitude: s.point!.lat, longitude: s.point!.lng })));
      return { error: stopsError };
    }, "تم إنشاء المسار ومحطاته.");
    if (ok) setForm(empty);
  };
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">المسارات</p><h2>إنشاء مسار</h2></div></div>
    {!hasSchoolLocation && <p className="save-strip ops-message ops-error"><X /><span>حدد موقع المدرسة أولًا من صفحة «المواقع»، لأنه يُضاف تلقائيًا كمحطة.</span></p>}
    <div className="driver-form route-form">
      <label>اسم المسار<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: مسار النسيم" /></label>
      <label>الاتجاه<select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}><option value="to_school">إلى المدرسة</option><option value="to_home">إلى المنزل</option></select></label>
      <label>وقت البداية<input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></label>
      <label className="wide-field">المحطات بالترتيب، كل سطر: اسم المحطة | الإحداثيات (تُضاف المدرسة تلقائيًا)<textarea dir="auto" value={form.stops} onChange={(e) => setForm({ ...form, stops: e.target.value })} placeholder={"حي النسيم | 24.7501, 46.8001\nحي الروضة | 24.7430, 46.7680"} /></label>
    </div>
    {lines.length > 0 && badLines > 0 && <p className="muted-label">{badLines} سطر بلا إحداثيات صحيحة. انسخ الإحداثيات من خرائط Google بالضغط على الموقع.</p>}
    <Button className="wide-action" disabled={!canAdd || busy} onClick={() => void add()}><Plus /> إنشاء المسار</Button>
  </article>;
}

function StudentsTab({ schoolId, setMessage, reload, students, routes, schoolName, busy, act }: { schoolId: string; setMessage: (m: { text: string; ok: boolean } | null) => void; reload: () => Promise<void>; students: Student[]; routes: RouteRow[]; schoolName: string; busy: boolean; act: Act }) {
  const photos = usePhotoUrls(students.map((st) => st.photo_path));
  const routeName = (id: string) => routes.find((r) => r.id === id)?.name ?? "مسار";
  const stopName = (routeId: string, stopId: string | null) => routes.find((r) => r.id === routeId)?.route_stops.find((s) => s.id === stopId)?.label ?? "بلا محطة";
  const [sheet, setSheet] = useState<CardStudent[] | null>(null);
  const [confirmReissue, setConfirmReissue] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unassigned" | "no_home" | "inactive">("all");
  const [grade, setGrade] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const grades = [...new Set(students.map((st) => st.grade).filter((g): g is string => Boolean(g)))].sort((a, b) => a.localeCompare(b, "ar"));
  const q = arabicKey(query);
  const shown = students.filter((st) => (!q || arabicKey(st.full_name).includes(q))
    && (!grade || st.grade === grade)
    && (filter === "all" || (filter === "unassigned" ? st.student_route_assignments.length === 0 : filter === "no_home" ? st.home_latitude == null || st.home_longitude == null : st.service_status !== "active")));
  const toCard = (st: Student): CardStudent => {
    const a = st.student_route_assignments.find((x) => routes.find((r) => r.id === x.route_id)?.direction === "to_school") ?? st.student_route_assignments[0];
    return { id: st.id, full_name: st.full_name, grade: st.grade, qr_token: st.qr_token, route: a ? routeName(a.route_id) : null, stop: a ? stopName(a.route_id, a.stop_id) : null };
  };
  if (sheet) return <CardsSheet students={sheet} schoolName={schoolName} onClose={() => setSheet(null)} />;
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">الطلاب</p><h2>إسناد الطلاب إلى المسارات</h2></div>
      {shown.length > 0 && <Button size="sm" variant="outline" onClick={() => setSheet(shown.map(toCard))}><Printer /> {shown.length === students.length ? "طباعة كل البطاقات" : `طباعة بطاقات النتائج (${shown.length})`}</Button>}</div>
    {students.length === 0 && <p className="muted-label">لا يوجد طلاب معتمدون بعد. اعتمد طلبات الطلاب من تبويب «الطلبات».</p>}
    {students.length > 0 && <div className="ops-actions student-filters">
      <label className="student-search"><Search /><input type="search" aria-label="بحث باسم الطالب" placeholder="ابحث باسم الطالب" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} /></label>
      <select aria-label="تصفية" value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); setLimit(PAGE); }}>
        <option value="all">كل الطلاب ({students.length})</option>
        <option value="unassigned">بلا مسار ({students.filter((st) => st.student_route_assignments.length === 0).length})</option>
        <option value="no_home">بلا موقع منزل ({students.filter((st) => st.home_latitude == null || st.home_longitude == null).length})</option>
        <option value="inactive">موقوفون أو غير نشطين ({students.filter((st) => st.service_status !== "active").length})</option>
      </select>
      {grades.length > 1 && <select aria-label="الصف" value={grade} onChange={(e) => { setGrade(e.target.value); setLimit(PAGE); }}><option value="">كل الصفوف</option>{grades.map((g) => <option key={g} value={g}>{g}</option>)}</select>}
    </div>}
    {students.length > 0 && shown.length === 0 && <p className="muted-label">لا يوجد طلاب بهذا البحث.</p>}
    {shown.slice(0, limit).map((student) => <div className="ops-row ops-student" key={student.id}>
      <StudentAvatar url={student.photo_path ? photos[student.photo_path] : null} name={student.full_name} />
      <div><strong>{student.full_name}</strong><p>{student.grade ?? "—"}</p>
        <div className="ops-chips">{student.student_route_assignments.map((a) => <span className="ops-chip" key={a.id}>{routeName(a.route_id)} · {stopName(a.route_id, a.stop_id)}<button aria-label="إلغاء الإسناد" disabled={busy} onClick={() => void act(() => supabase.from("student_route_assignments").delete().eq("id", a.id), "تم إلغاء الإسناد.")}><X /></button></span>)}</div>
      </div>
      <div className="ops-actions">
        <AssignForm student={student} routes={routes} busy={busy} act={act} />
        <Button size="sm" variant="outline" onClick={() => setSheet([toCard(student)])}><IdCard /> البطاقة</Button>
        <StudentPhotoButton schoolId={schoolId} studentId={student.id} name={student.full_name} hasPhoto={Boolean(student.photo_path)} onSaved={(text) => { setMessage({ text, ok: !text.startsWith("تعذر") }); void reload(); }} />
        {confirmReissue === student.id ? <><Button size="sm" className="danger-btn" disabled={busy} onClick={() => void act(() => supabase.rpc("reissue_student_card", { p_student: student.id }), `صدرت بطاقة جديدة لـ ${student.full_name}، والبطاقة القديمة لم تعد تعمل. اطبع الجديدة.`).then(() => setConfirmReissue(null))}>تأكيد: إيقاف القديمة</Button><Button size="sm" variant="outline" onClick={() => setConfirmReissue(null)}>إلغاء</Button></>
          : <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmReissue(student.id)}>بطاقة مفقودة</Button>}
      </div>
    </div>)}
    {shown.length > limit && <Button className="wide-action" variant="outline" onClick={() => setLimit(limit + PAGE)}>عرض المزيد ({shown.length - limit} طالبًا)</Button>}
  </article>;
}

function AssignForm({ student, routes, busy, act }: { student: Student; routes: RouteRow[]; busy: boolean; act: Act }) {
  const available = routes.filter((r) => r.is_active && !student.student_route_assignments.some((a) => a.route_id === r.id));
  const [routeId, setRouteId] = useState("");
  const [stopId, setStopId] = useState("");
  const route = available.find((r) => r.id === routeId);
  const stops = route?.route_stops.filter((s) => s.stop_type !== "school") ?? [];
  if (!available.length) return null;
  return <div className="ops-actions">
    <select aria-label="المسار" value={routeId} onChange={(e) => { setRouteId(e.target.value); setStopId(""); }}><option value="">اختر المسار</option>{available.map((r) => <option key={r.id} value={r.id}>{r.name} ({directionLabel(r.direction)})</option>)}</select>
    <select aria-label="المحطة" value={stopId} disabled={!route} onChange={(e) => setStopId(e.target.value)}><option value="">اختر المحطة</option>{stops.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
    <Button size="sm" disabled={busy || !routeId || !stopId} onClick={() => void act(() => supabase.from("student_route_assignments").insert({ student_id: student.id, route_id: routeId, stop_id: stopId }), `تم إسناد ${student.full_name} إلى ${route?.name}.`).then((ok) => { if (ok) { setRouteId(""); setStopId(""); } })}>إسناد</Button>
  </div>;
}

function TripsTab({ schoolId, autoTrips, routes, trips, drivers, buses, students, busy, act }: { schoolId: string; autoTrips: boolean; routes: RouteRow[]; trips: Trip[]; drivers: Driver[]; buses: Bus[]; students: Student[]; busy: boolean; act: Act }) {
  const today = riyadhWeekday();
  const { todayHoliday } = useHolidays(schoolId);
  const busById = (id: string | null) => buses.find((b) => b.id === id);
  const todayStr = riyadhToday();
  const fleetBlock = (r: RouteRow) => {
    const b = busById(r.bus_id); const d = drivers.find((x) => x.id === r.driver_id);
    if (b?.status === "maintenance") return "الباص في الصيانة";
    if (b?.next_service_on && b.next_service_on < todayStr) return "صيانة الباص متأخرة";
    if (b && [b.registration_expiry, b.insurance_expiry, b.inspection_expiry].some((x) => x && x < todayStr)) return "وثائق الباص منتهية";
    if (d?.license_expiry && d.license_expiry < todayStr) return "رخصة السائق منتهية";
    return null;
  };
  const runsToday = (r: RouteRow) => (r.days ?? [0, 1, 2, 3, 4]).includes(today);
  const active = routes.filter((r) => r.is_active && !r.archived_at);
  const [actualFor, setActualFor] = useState<string | null>(null);
  // الرحلة الملغاة لا تحجز المسار في العرض؛ تظهر وحدها مع زر «إعادة الإنشاء»
  const tripFor = (routeId: string) => trips.find((t) => t.route_id === routeId && t.status !== "cancelled");
  const cancelledFor = (routeId: string) => trips.find((t) => t.route_id === routeId && t.status === "cancelled");
  const studentsOn = (routeId: string) => students.filter((s) => s.student_route_assignments.some((a) => a.route_id === routeId)).length;
  // سبب عدم جاهزية المسار لإنشاء رحلة اليوم، أو null إن كان جاهزًا
  const blocker = (r: RouteRow) => todayHoliday ? "إجازة" : !runsToday(r) ? "لا يعمل اليوم" : fleetBlock(r) ? fleetBlock(r) : !r.driver_id ? "بلا سائق" : !r.bus_id ? "بلا باص" : r.route_stops.length < 2 ? "محطات غير كافية"
    : r.route_stops.some((s) => s.latitude == null || s.longitude == null) ? "محطة بلا موقع" : !studentsOn(r.id) ? "لا طلاب مسندين" : null;
  // المسار الذي أُلغيت رحلته اليوم لا يُعاد إنشاؤه تلقائيًا (نفس قاعدة الخادم)
  const ready = active.filter((r) => !tripFor(r.id) && !cancelledFor(r.id) && !blocker(r));
  const createAll = () => void act(() => supabase.rpc("create_today_trips", { p_school: schoolId }), (data) => {
    const res = data as { created: number; skipped: { route: string; reason: string }[] };
    const problems = res.skipped.filter((x) => x.reason !== "NOT_RUNNING_TODAY" && x.reason !== "SCHOOL_HOLIDAY");
    if (!problems.length) return { text: res.created ? `تم إنشاء ${res.created} رحلة لليوم وإسنادها للسائقين.` : "لا توجد مسارات جاهزة لإنشاء رحلات.", ok: res.created > 0 };
    return { text: `أُنشئت ${res.created} رحلة. تعذر: ${problems.map((x) => `${x.route}: ${routeReasonText[x.reason] ?? errorText({ message: x.reason })}`).join(" — ")}`, ok: false };
  });
  const recreate = (r: RouteRow) => void act(() => supabase.from("trips").insert({ school_id: schoolId, route_id: r.id, bus_id: r.bus_id, driver_id: r.driver_id, direction: r.direction, status: "scheduled", trip_date: riyadhToday() }), `أُعيد إنشاء رحلة ${r.name} لليوم.`);
  const toggleAuto = () => void act(() => supabase.rpc("set_auto_daily_trips", { p_school: schoolId, p_on: !autoTrips }),
    autoTrips ? "أُوقف الإنشاء التلقائي. أنشئ رحلات كل يوم بالزر أعلاه." : "تُنشأ رحلات كل يوم دراسي تلقائيًا الساعة 4:30 فجرًا.");
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">{riyadhToday()}</p><h2>رحلات اليوم</h2></div><Button disabled={busy || ready.length === 0} onClick={createAll}><Plus /> إنشاء رحلات اليوم ({ready.length})</Button></div>
    <label className="auto-trips"><input type="checkbox" checked={autoTrips} disabled={busy} onChange={toggleAuto} /> إنشاء رحلات كل يوم دراسي تلقائيًا (4:30 فجرًا)، ويصلك ملخص بما تعذّر</label>
    {todayHoliday && <p className="save-strip ops-message"><span>اليوم إجازة ({todayHoliday.title})؛ لا تُنشأ رحلات.</span></p>}
    {active.length === 0 && <p className="muted-label">لا توجد مسارات نشطة.</p>}
    {active.map((r) => {
      const trip = tripFor(r.id); const cancelled = !trip && cancelledFor(r.id); const why = blocker(r);
      const driver = drivers.find((d) => d.id === r.driver_id)?.full_name; const bus = buses.find((b) => b.id === r.bus_id)?.bus_number;
      return <div className="ops-row" key={r.id}>
        <div><strong>{r.name}</strong><p>{[directionLabel(r.direction), r.scheduled_time?.slice(0, 5), driver && `السائق ${driver}`, bus && `باص ${bus}`, `${studentsOn(r.id)} طالب`].filter(Boolean).join(" · ")}</p></div>
        <div className="ops-actions">
          {trip ? <Badge className="status-badge tone-0">{tripStatusLabel[trip.status] ?? trip.status}</Badge> : cancelled ? <Badge className="status-badge tone-1">ملغاة اليوم</Badge> : why ? <Badge className="status-badge tone-1">{why}</Badge> : <Badge className="status-badge tone-2">جاهز للإنشاء</Badge>}
          {cancelled && !why && <Button size="sm" variant="outline" disabled={busy} onClick={() => recreate(r)}><RotateCcw /> إعادة الإنشاء</Button>}
          {trip && trip.status !== "scheduled" && trip.status !== "ready" && trip.status !== "cancelled" && <Button size="sm" variant="outline" onClick={() => setActualFor(actualFor === trip.id ? null : trip.id)}>{actualFor === trip.id ? "إخفاء المسار الفعلي" : "المسار الفعلي"}</Button>}
          {trip && (trip.status === "scheduled" || trip.status === "ready") && <select className="sub-driver" aria-label={`سائق رحلة ${r.name} اليوم`} value={trip.driver_id ?? ""} disabled={busy}
            onChange={(e) => { const d = drivers.find((x) => x.id === e.target.value); if (d) void act(() => supabase.from("trips").update({ driver_id: d.id }).eq("id", trip.id), d.id === r.driver_id ? `عاد ${d.full_name} سائقًا لرحلة ${r.name}.` : `${d.full_name} سائق بديل لرحلة ${r.name} اليوم فقط، وأُبلغ بذلك.`); }}>
            {drivers.filter((d) => d.status === "active").map((d) => <option key={d.id} value={d.id}>{d.id === r.driver_id ? `${d.full_name} (الأساسي)` : `بديل: ${d.full_name}`}</option>)}</select>}
          {trip && (trip.status === "scheduled" || trip.status === "ready") && <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm(`إلغاء رحلة ${r.name} اليوم؟`)) void act(() => supabase.from("trips").update({ status: "cancelled" }).eq("id", trip.id), "تم إلغاء الرحلة."); }}>إلغاء</Button>}
        </div>
        {trip && actualFor === trip.id && <TripActual tripId={trip.id} onClose={() => setActualFor(null)} />}
      </div>;
    })}
  </article>;
}
