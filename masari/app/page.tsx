"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Activity, AlertTriangle, BarChart3, Bell, BusFront, CalendarDays,
  Check, ChevronLeft, CircleDollarSign, Clock3, FileClock, GraduationCap,
  LayoutDashboard, MapPin, Menu, MessageSquareText, Navigation, Plus,
  RadioTower, Route, School, Search, ShieldCheck, UserPlus, Users, WalletCards, X, ClipboardList,
} from "lucide-react";
import { SchoolOps } from "./school-ops";
import { PendingAccount, AdminSchools } from "./onboarding";
import { LiveControl } from "./live-control";
import { ForgotPassword, ResetPasswordPage, isRecoveryLink, PushToggle } from "./account";
import { Landing } from "./landing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";

type Role = "executive" | "school" | "driver" | "parent";
type AuthMode = "demo" | "authenticated";
type View = "operations" | "dashboard" | "control" | "locations" | "schools" | "students" | "fleet" | "routes" | "trips" | "finance" | "reports" | "audit";
type LocationPoint = { label: string; address: string; lat: number; lng: number };
type DriverForm = { name: string; phone: string; email: string; plate: string; status: string };
type DriverRow = DriverForm & { capacity?: number; saved?: boolean };
type StudentForm = { name: string; grade: string; parentName: string; parentPhone: string; parentEmail: string; address: string; status: string };
type StudentRow = StudentForm & { saved?: boolean };
type RouteForm = { name: string; direction: "to_school" | "to_home"; scheduledTime: string; stopsText: string; status: string };
type RouteRow = { name: string; direction: string; scheduledTime: string; stops: string; status: string; saved?: boolean };
type MasariData = {
  source: "cached" | "supabase" | "empty";
  school: { id?: string; located?: boolean; name: string; city: string; contactName: string; phone: string; location: LocationPoint };
  vehicle: { number: string; plate: string; capacity: number };
  driver: { name: string; email: string };
  route: { name: string; scheduledTime: string; estimatedMinutes: number; stops: { id?: string; status?: string; label: string; time: string; lat: number; lng: number; studentName?: string | null }[] };
  student: { id?: string; name: string; grade: string; address: string; status: string; location: LocationPoint };
  parent: { name: string; email: string; phone: string };
  ride: { date: string; status: string; studentStatus: string };
  counts?: { students: number; buses: number; routes: number; subscriptions: number };
  // الرحلة الفعلية اليوم وطلابها (للحساب الفعلي فقط).
  trip?: { id: string; status: string; date: string; direction: string } | null;
  students?: { id: string; name: string; grade: string; status: string }[];
};
type SimulationState = {
  active: boolean;
  currentStopIndex: number;
  approvedStops: number[];
  studentStatus: "waiting" | "approaching" | "on_bus" | "arrived";
};
type TripContext = { tripId: string };
type DriverGps = LocationPoint & { accuracy?: number | null; updatedAt?: string };
type TripEventRow = { id?: string; eventType: string; note: string; createdAt: string; studentName?: string | null };
type FeedbackItem = { id: string; author: string; role: "parent" | "school" | "driver" | "executive"; rating: number; category: string; message: string; status: string; createdAt: string; saved?: boolean };
type NotificationItem = { id: string; title: string; body: string; time: string; tone: "green" | "blue" | "amber" | "red" };

const roleNames: Record<Role, string> = {
  executive: "الإدارة التنفيذية", school: "إدارة المدرسة", driver: "السائق", parent: "ولي الأمر",
};
const navByRole: Record<Role, { id: View; label: string; icon: typeof LayoutDashboard }[]> = {
  executive: [
    { id: "dashboard", label: "نظرة عامة", icon: LayoutDashboard }, { id: "schools", label: "المدارس", icon: School },
    { id: "control", label: "برج المراقبة", icon: RadioTower },
    { id: "locations", label: "المواقع", icon: MapPin },
    { id: "students", label: "الطلاب", icon: GraduationCap }, { id: "fleet", label: "الأسطول والسائقون", icon: BusFront },
    { id: "routes", label: "المسارات", icon: Route }, { id: "trips", label: "الرحلات", icon: Navigation },
    { id: "finance", label: "الاشتراكات", icon: WalletCards }, { id: "reports", label: "التقارير", icon: BarChart3 },
    { id: "audit", label: "سجل التدقيق", icon: FileClock },
  ],
  school: [
    { id: "dashboard", label: "نظرة عامة", icon: LayoutDashboard }, { id: "operations", label: "التشغيل اليومي", icon: ClipboardList }, { id: "students", label: "الطلاب", icon: GraduationCap },
    { id: "control", label: "برج المراقبة", icon: RadioTower },
    { id: "locations", label: "المواقع", icon: MapPin },
    { id: "fleet", label: "الباصات والسائقون", icon: BusFront }, { id: "routes", label: "المسارات", icon: Route },
    { id: "trips", label: "الرحلات اليومية", icon: Navigation }, { id: "reports", label: "التقارير", icon: BarChart3 },
  ],
  driver: [{ id: "dashboard", label: "رحلة اليوم", icon: Navigation }, { id: "trips", label: "سجل الرحلات", icon: CalendarDays }],
  parent: [
    { id: "dashboard", label: "متابعة الرحلة", icon: MapPin }, { id: "students", label: "أبنائي", icon: GraduationCap },
    { id: "locations", label: "المواقع", icon: Navigation },
    { id: "trips", label: "سجل الرحلات", icon: CalendarDays }, { id: "finance", label: "الاشتراك", icon: WalletCards },
  ],
};
const schoolLocation: LocationPoint = { label: "موقع المدرسة", address: "الرياض", lat: 24.7136, lng: 46.6753 };
// قالب فارغ محايد قبل تحميل بيانات الحساب (لا أسماء ولا أرقام).
const blankData: MasariData = {
  source: "empty",
  school: { name: "—", city: "—", contactName: "—", phone: "—", location: schoolLocation },
  vehicle: { number: "—", plate: "—", capacity: 0 },
  driver: { name: "—", email: "" },
  route: { name: "—", scheduledTime: "—", estimatedMinutes: 0, stops: [] },
  student: { name: "—", grade: "—", address: "—", status: "—", location: schoolLocation },
  parent: { name: "—", email: "", phone: "—" },
  ride: { date: "—", status: "scheduled", studentStatus: "scheduled" },
};

const formatTime = (value?: string | null) => value ? value.slice(0, 5) : "";
const statusLabel = (status?: string) => ({
  scheduled: "مجدولة",
  in_progress: "جارية الآن",
  completed: "مكتملة",
  cancelled: "ملغاة",
  active: "نشط",
  pending: "قيد الإعداد",
}[status ?? ""] ?? status ?? "مجدولة");
const toNumber = (value: unknown, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const makeLocation = (label: string, address: string, lat: unknown, lng: unknown, fallback: LocationPoint): LocationPoint => ({
  label,
  address: address || fallback.address,
  lat: toNumber(lat, fallback.lat),
  lng: toNumber(lng, fallback.lng),
});
const STOP_RADIUS_METERS = 250;
const distanceMeters = (from: Pick<LocationPoint, "lat" | "lng">, to: Pick<LocationPoint, "lat" | "lng">) => {
  const earthRadius = 6371000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const haversine = Math.sin(latDelta / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lngDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};
const addMinutes = (time: string, minutes: number) => {
  const [hours, mins] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return time;
  const total = (hours * 60 + mins + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const ensureSchoolDestination = (route: MasariData["route"], school: MasariData["school"]): MasariData["route"] => {
  const alreadyIncluded = route.stops.some((stop) => distanceMeters(stop, school.location) <= 120);
  if (alreadyIncluded) return route;
  const lastTime = route.stops.at(-1)?.time || route.scheduledTime;
  return {
    ...route,
    stops: [...route.stops, { label: school.name, time: addMinutes(lastTime, 15), lat: school.location.lat, lng: school.location.lng }],
  };
};
const buildMapUrl = (points: LocationPoint[], marker: LocationPoint) => {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const south = Math.min(...lats) - 0.025;
  const north = Math.max(...lats) + 0.025;
  const west = Math.min(...lngs) - 0.035;
  const east = Math.max(...lngs) + 0.035;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${west}%2C${south}%2C${east}%2C${north}&layer=mapnik&marker=${marker.lat}%2C${marker.lng}`;
};
const initialSimulation: SimulationState = { active: false, currentStopIndex: 0, approvedStops: [], studentStatus: "waiting" };
const studentStatusLabel: Record<SimulationState["studentStatus"], string> = {
  waiting: "بانتظار بدء الرحلة",
  approaching: "الباص في الطريق",
  on_bus: "في الباص",
  arrived: "وصل المدرسة",
};
const eventTypeLabel = (eventType: string) => ({
  pickup: "صعود الطالب",
  dropoff: "نزول / وصول",
  absent: "غياب",
  delay: "تأخير",
  emergency: "طارئ",
  note: "تحديث رحلة",
}[eventType] ?? "تحديث رحلة");
type DbNotification = { id: string; type: string; title: string; body: string | null; created_at: string; read_at: string | null };
const noteTone = (type: string): NotificationItem["tone"] => type.includes("emergency") ? "red" : type === "delay" || type === "no_show" ? "amber" : type.includes("arrived") || type.includes("dropped") || type.includes("boarded") ? "green" : "blue";
const formatEventTime = (value?: string | null) => {
  if (!value) return "الآن";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "الآن";
  return date.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
};
const buildNotifications = (data: MasariData, simulation: SimulationState, driverGps: DriverGps | null, tripEvents: TripEventRow[], feedbackRows: FeedbackItem[]): NotificationItem[] => {
  const eventNotifications = tripEvents.slice(0, 5).map((event, index) => ({
    id: event.id ?? `event-${index}`,
    title: eventTypeLabel(event.eventType),
    body: event.note || `رحلة ${data.student.name}`,
    time: formatEventTime(event.createdAt),
    tone: event.eventType === "emergency" ? "red" as const : event.eventType === "delay" ? "amber" as const : event.eventType === "pickup" || event.eventType === "dropoff" ? "green" as const : "blue" as const,
  }));
  const gpsNotification: NotificationItem | null = driverGps ? {
    id: "gps-live",
    title: "تم تحديث موقع الباص",
    body: `${driverGps.lat.toFixed(5)}, ${driverGps.lng.toFixed(5)}`,
    time: formatEventTime(driverGps.updatedAt),
    tone: "blue",
  } : null;
  const feedbackNotification: NotificationItem | null = feedbackRows[0] ? {
    id: `feedback-${feedbackRows[0].id}`,
    title: `${feedbackRows[0].category} من ${feedbackRows[0].author}`,
    body: feedbackRows[0].message,
    time: formatEventTime(feedbackRows[0].createdAt),
    tone: feedbackRows[0].rating >= 4 ? "green" : feedbackRows[0].rating <= 2 ? "red" : "amber",
  } : null;
  const fallback: NotificationItem = {
    id: "trip-state",
    title: simulation.active ? "الرحلة جارية الآن" : "رحلة اليوم مجدولة",
    body: `${data.route.name} · ${studentStatusLabel[simulation.studentStatus]}`,
    time: "الآن",
    tone: simulation.active ? "green" : "amber",
  };
  return [gpsNotification, feedbackNotification, ...eventNotifications, fallback].filter(Boolean).slice(0, 6) as NotificationItem[];
};

// حساب بلا بيانات أو بلا جلسة → "empty" فتظهر شاشة «لا توجد بيانات بعد».
const riyadhToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const ACTIVE_TRIP_STATUSES = ["in_progress", "paused", "emergency"];
const rpcErrorText: Record<string, string> = {
  NOT_ACTIVE_DRIVER: "حساب السائق غير مفعّل.",
  TRIP_NOT_ASSIGNED: "هذه الرحلة غير مسندة إليك.",
  TRIP_NOT_STARTABLE: "لا يمكن بدء هذه الرحلة في حالتها الحالية.",
  TRIP_NOT_TODAY: "هذه الرحلة ليست مجدولة لليوم.",
  ROUTE_HAS_NO_STOPS: "المسار لا يحتوي على محطات.",
  STOP_HAS_NO_LOCATION: "إحدى المحطات بلا موقع على الخريطة. تواصل مع المدرسة.",
  DRIVER_OR_BUS_HAS_ACTIVE_TRIP: "لديك أو لدى الباص رحلة أخرى جارية.",
  TRIP_NOT_ACTIVE: "الرحلة ليست جارية.",
  GPS_REQUIRED: "يلزم موقع GPS فعلي.",
  GPS_ACCURACY_TOO_LOW: "دقة GPS ضعيفة. انتظر قليلًا ثم أعد المحاولة.",
  STOP_ALREADY_APPROVED: "تم اعتماد هذه المحطة مسبقًا.",
  STOP_OUT_OF_ORDER: "اعتمد المحطات بالترتيب.",
  OUTSIDE_STOP_RADIUS: "أنت خارج نطاق المحطة.",
  BUS_CHECK_REQUIRED: "يجب تأكيد خلو الباص قبل إنهاء الرحلة.",
  STOPS_NOT_PROCESSED: "توجد محطات لم تُعتمد أو تُتخطَّ بعد.",
  STUDENTS_STILL_ON_BUS: "ما زال طلاب مسجلون داخل الباص.",
  FORBIDDEN: "ليست لديك صلاحية لهذا الإجراء.",
  STOP_NOT_REACHED: "اعتمد الوصول إلى محطة الطالب أولًا.",
  INVALID_TRANSITION: "لا يمكن تسجيل هذه الحالة للطالب الآن.",
  STUDENT_NOT_IN_TRIP: "الطالب غير مسجل في هذه الرحلة.",
  TRIP_ALREADY_STARTED: "بدأت الرحلة، ولا يمكن تغيير الغياب الآن. تواصل مع المدرسة.",
};
const rpcError = (error: { message?: string } | null) => {
  const code = Object.keys(rpcErrorText).find((key) => error?.message?.includes(key));
  return code ? rpcErrorText[code] : "تعذر تنفيذ العملية. حاول مرة أخرى.";
};
type AttendanceEvent = "boarded" | "no_show" | "boarded_return" | "dropped_home";
const attendanceActions = (direction: string | undefined, status: string): { event: AttendanceEvent; label: string }[] => {
  const waiting = status === "not_boarded" || status === "waiting";
  if (direction === "to_home") return waiting ? [{ event: "boarded_return", label: "صعد" }] : status === "boarded_return" ? [{ event: "dropped_home", label: "نزل" }] : [];
  return waiting ? [{ event: "boarded", label: "صعد" }, { event: "no_show", label: "لم يحضر" }] : [];
};
const attendanceDoneText: Record<AttendanceEvent, string> = {
  boarded: "تم تسجيل صعود الطالب وإشعار ولي الأمر.", boarded_return: "تم تسجيل صعود الطالب وإشعار ولي الأمر.",
  dropped_home: "تم تسجيل نزول الطالب عند المنزل وإشعار ولي الأمر.", no_show: "تم تسجيل عدم حضور الطالب وإشعار ولي الأمر.",
};
const tripBadge = (status?: string): { text: string; tone: "safe" | "warn" | "danger" | "muted" } =>
  !status ? { text: "لا توجد رحلة اليوم", tone: "muted" }
  : status === "in_progress" ? { text: "الرحلة جارية", tone: "safe" }
  : status === "paused" ? { text: "الرحلة متوقفة مؤقتًا", tone: "warn" }
  : status === "emergency" ? { text: "حالة طارئة", tone: "danger" }
  : status === "completed" ? { text: "انتهت الرحلة", tone: "muted" }
  : status === "cancelled" ? { text: "الرحلة ملغاة", tone: "warn" }
  : { text: "الرحلة مجدولة", tone: "muted" };
const studentStatusFromDb = (status?: string): SimulationState["studentStatus"] =>
  status === "boarded" || status === "boarded_return" ? "on_bus"
  : status === "arrived_school" || status === "dropped_home" ? "arrived"
  : status === "waiting" ? "approaching" : "waiting";
const tripStudentLabel: Record<string, string> = {
  not_boarded: "لم يصعد", waiting: "الباص قادم", boarded: "في الباص", arrived_school: "وصل المدرسة",
  absent: "غائب", boarded_return: "في الباص", dropped_home: "وصل المنزل", no_show: "لم يحضر", emergency: "حالة طارئة",
  active: "مسجل في المسار",
};
// حالة الشاشة تُشتق من الرحلة المحفوظة، لا من محاكاة محلية.
const simulationFromTrip = (d: MasariData): SimulationState | null => {
  if (!d.trip) return null;
  const approvedStops = d.route.stops.flatMap((stop, i) => stop.status && stop.status !== "pending" ? [i] : []);
  const firstPending = d.route.stops.findIndex((stop) => !stop.status || stop.status === "pending");
  return {
    active: ACTIVE_TRIP_STATUSES.includes(d.trip.status),
    currentStopIndex: firstPending < 0 ? Math.max(0, d.route.stops.length - 1) : firstPending,
    approvedStops,
    studentStatus: studentStatusFromDb((d.students?.find((st) => st.id === d.student.id) ?? d.students?.[0])?.status),
  };
};
const blankDataFor = (school: { id: string; name: string; city: string | null; contact_name: string | null; phone: string | null; address: string | null; latitude: unknown; longitude: unknown }): MasariData => {
  const schoolLoc = makeLocation("موقع المدرسة", school.address ?? school.city ?? "—", school.latitude, school.longitude, schoolLocation);
  return {
    source: "supabase",
    school: { id: school.id, located: school.latitude != null && school.longitude != null, name: school.name, city: school.city ?? "—", contactName: school.contact_name ?? "—", phone: school.phone ?? "—", location: schoolLoc },
    vehicle: { number: "—", plate: "—", capacity: 0 },
    driver: { name: "—", email: "" },
    route: { name: "لا يوجد مسار", scheduledTime: "—", estimatedMinutes: 0, stops: [] },
    student: { name: "لا يوجد طالب", grade: "—", address: "—", status: "—", location: schoolLoc },
    parent: { name: "—", email: "", phone: "—" },
    ride: { date: "—", status: "scheduled", studentStatus: "scheduled" },
  };
};
const SCHOOL_COLUMNS = "id,name,city,contact_name,phone,address,latitude,longitude";
type StopRow = { id?: string; status?: string; label: string | null; scheduled_time: string | null; latitude: unknown; longitude: unknown };
const toStops = (rows: StopRow[] | null, fallback: LocationPoint) => (rows ?? []).map((stop) => ({
  id: stop.id, status: stop.status,
  label: stop.label ?? "نقطة توقف", time: formatTime(stop.scheduled_time),
  lat: toNumber(stop.latitude, fallback.lat), lng: toNumber(stop.longitude, fallback.lng), studentName: null,
}));
async function applyRouteAndTrip(next: MasariData, routeId: string, trip: { id: string; status: string; trip_date: string; direction: string; bus_id: string | null; driver_id: string | null } | null) {
  const [{ data: routes }, { data: tripStops }, { data: routeStops }] = await Promise.all([
    supabase.from("routes").select("name,scheduled_time,estimated_duration_minutes,bus_id").eq("id", routeId).limit(1),
    trip ? supabase.from("trip_stops").select("id,status,label,scheduled_time,latitude,longitude").eq("trip_id", trip.id).order("stop_order") : Promise.resolve({ data: null }),
    supabase.from("route_stops").select("label,scheduled_time,latitude,longitude").eq("route_id", routeId).order("stop_order"),
  ]);
  const route = routes?.[0];
  if (route) {
    next.route.name = route.name;
    next.route.scheduledTime = formatTime(route.scheduled_time) || "—";
    next.route.estimatedMinutes = route.estimated_duration_minutes ?? 0;
  }
  next.route.stops = toStops(tripStops?.length ? tripStops : routeStops, next.school.location);
  const busId = trip?.bus_id ?? route?.bus_id;
  if (busId) {
    const { data: buses } = await supabase.from("buses").select("bus_number,plate_number,capacity").eq("id", busId).limit(1);
    if (buses?.[0]) next.vehicle = { number: buses[0].bus_number, plate: buses[0].plate_number, capacity: buses[0].capacity };
  }
  if (trip) {
    next.trip = { id: trip.id, status: trip.status, date: trip.trip_date, direction: trip.direction };
    next.ride = { ...next.ride, date: trip.trip_date, status: trip.status };
  }
}
type StudentJoin = { id: string; full_name: string; grade: string | null } | { id: string; full_name: string; grade: string | null }[] | null;
const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;

// السائق: رحلته المسندة إليه اليوم فقط.
async function loadDriverData(userId: string): Promise<MasariData | null> {
  const { data: drivers } = await supabase.from("drivers").select("id,school_id,full_name,email").eq("user_id", userId).limit(1);
  const driver = drivers?.[0];
  if (!driver) return null;
  const { data: schools } = await supabase.from("schools").select(SCHOOL_COLUMNS).eq("id", driver.school_id).limit(1);
  if (!schools?.[0]) return null;
  const next = blankDataFor(schools[0]);
  next.driver = { name: driver.full_name, email: driver.email ?? "" };
  const { data: trips } = await supabase.from("trips").select("id,route_id,bus_id,driver_id,trip_date,status,direction,scheduled_start,completed_at")
    .eq("driver_id", driver.id).eq("trip_date", riyadhToday()).neq("status", "cancelled").order("scheduled_start", { ascending: true, nullsFirst: true });
  const trip = trips?.find((t) => t.status !== "completed") ?? [...(trips ?? [])].sort((x, y) => (y.completed_at ?? "").localeCompare(x.completed_at ?? ""))[0];
  if (!trip) return null;
  await applyRouteAndTrip(next, trip.route_id, trip);

  const { data: tripStudents } = await supabase.from("trip_students").select("status,students(id,full_name,grade)").eq("trip_id", trip.id);
  if (tripStudents?.length) {
    next.students = tripStudents.flatMap((row) => { const st = one(row.students as StudentJoin); return st ? [{ id: st.id, name: st.full_name, grade: st.grade ?? "—", status: row.status }] : []; });
  } else {
    const { data: assigned } = await supabase.from("student_route_assignments").select("students(id,full_name,grade)").eq("route_id", trip.route_id).eq("status", "active");
    next.students = (assigned ?? []).flatMap((row) => { const st = one(row.students as StudentJoin); return st ? [{ id: st.id, name: st.full_name, grade: st.grade ?? "—", status: "not_boarded" }] : []; });
  }
  if (next.students[0]) next.student = { ...next.student, id: next.students[0].id, name: next.students[0].name, grade: next.students[0].grade, status: tripStudentLabel[next.students[0].status] ?? next.students[0].status };
  return next;
}

// ولي الأمر: أبناؤه المرتبطون به فقط، ورحلة اليوم للابن الأول.
async function loadParentData(userId: string, childId?: string | null): Promise<MasariData | null> {
  const { data: guardians } = await supabase.from("guardians").select("id,full_name,phone,email").eq("user_id", userId).eq("status", "active");
  if (!guardians?.length) return null;
  const { data: links } = await supabase.from("guardian_students")
    .select("students(id,school_id,full_name,grade,home_address,home_label,home_latitude,home_longitude,service_status)")
    .in("guardian_id", guardians.map((g) => g.id));
  type ChildRow = { id: string; school_id: string; full_name: string; grade: string | null; home_address: string | null; home_label: string | null; home_latitude: unknown; home_longitude: unknown; service_status: string };
  const children = (links ?? []).flatMap((row) => { const c = one(row.students as ChildRow | ChildRow[] | null); return c ? [c] : []; });
  const child = children.find((c) => c.id === childId) ?? children[0];
  if (!child) return null;
  const [{ data: schools }, { data: assignments }] = await Promise.all([
    supabase.from("schools").select(SCHOOL_COLUMNS).eq("id", child.school_id).limit(1),
    supabase.from("student_route_assignments").select("route_id").eq("student_id", child.id).eq("status", "active"),
  ]);
  if (!schools?.[0]) return null;
  const next = blankDataFor(schools[0]);
  next.parent = { name: guardians[0].full_name, email: guardians[0].email ?? "", phone: guardians[0].phone ?? "—" };
  next.student = {
    id: child.id, name: child.full_name, grade: child.grade ?? "—", address: child.home_address ?? "—", status: statusLabel(child.service_status),
    location: makeLocation(child.home_label ?? "موقع البيت", child.home_address ?? "—", child.home_latitude, child.home_longitude, next.school.location),
  };
  next.students = children.map((c) => ({ id: c.id, name: c.full_name, grade: c.grade ?? "—", status: "active" }));

  const routeIds = (assignments ?? []).map((row) => row.route_id);
  const { data: todays } = routeIds.length
    ? await supabase.from("trips").select("id,route_id,bus_id,driver_id,trip_date,status,direction,scheduled_start,completed_at")
        .in("route_id", routeIds).eq("trip_date", riyadhToday()).neq("status", "cancelled").order("scheduled_start", { ascending: true, nullsFirst: true })
    : { data: null };
  const trip = todays?.find((t) => ACTIVE_TRIP_STATUSES.includes(t.status))
    ?? todays?.find((t) => t.status === "scheduled" || t.status === "ready")
    ?? [...(todays ?? [])].sort((x, y) => (y.completed_at ?? "").localeCompare(x.completed_at ?? ""))[0];
  if (trip) {
    const [, { data: mine }, { data: drv }] = await Promise.all([
      applyRouteAndTrip(next, trip.route_id, trip),
      supabase.from("trip_students").select("status").eq("trip_id", trip.id).eq("student_id", child.id).limit(1),
      trip.driver_id ? supabase.from("drivers").select("full_name").eq("id", trip.driver_id).limit(1) : Promise.resolve({ data: null }),
    ]);
    next.students = next.students.map((c) => c.id === child.id ? { ...c, status: mine?.[0]?.status ?? "not_boarded" } : c);
    if (drv?.[0]) next.driver = { name: drv[0].full_name, email: "" };
  } else if (routeIds[0]) await applyRouteAndTrip(next, routeIds[0], null);
  return next;
}

async function loadMasariData(childId?: string | null): Promise<MasariData> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (session) {
    const { data: accessData } = await supabase.rpc("my_access");
    const role = roleFromAccess(accessData as MyAccess | null);
    if (role === "driver" || role === "parent") {
      const roleData = role === "driver" ? await loadDriverData(session.user.id) : await loadParentData(session.user.id, childId);
      return roleData ?? structuredClone(blankData);
    }
  }
  const { data: schools } = await supabase
    .from("schools")
    .select("id,name,city,contact_name,phone,address,latitude,longitude")
    .order("created_at")
    .limit(1);
  const school = schools?.[0];
  if (!school) return structuredClone(blankData);

  const schoolLoc = makeLocation("موقع المدرسة", school.address ?? school.city ?? "—", school.latitude, school.longitude, schoolLocation);
  const next: MasariData = {
    source: "supabase",
    school: { id: school.id, located: school.latitude != null && school.longitude != null, name: school.name, city: school.city ?? "—", contactName: school.contact_name ?? "—", phone: school.phone ?? "—", location: schoolLoc },
    vehicle: { number: "—", plate: "—", capacity: 0 },
    driver: { name: "—", email: "" },
    route: { name: "لا يوجد مسار", scheduledTime: "—", estimatedMinutes: 0, stops: [] },
    student: { name: "لا يوجد طالب", grade: "—", address: "—", status: "—", location: schoolLoc },
    parent: { name: "—", email: "", phone: "—" },
    ride: { date: "—", status: "scheduled", studentStatus: "scheduled" },
  };

  const { data: routes } = await supabase
    .from("routes")
    .select("id,name,scheduled_time,estimated_duration_minutes,bus_id")
    .eq("school_id", school.id)
    .eq("is_active", true)
    .order("created_at")
    .limit(1);
  const route = routes?.[0];
  if (route) {
    next.route.name = route.name;
    next.route.scheduledTime = formatTime(route.scheduled_time) || "—";
    next.route.estimatedMinutes = route.estimated_duration_minutes ?? 0;

    const { data: stops } = await supabase
      .from("route_stops")
      .select("label,scheduled_time,stop_order,latitude,longitude")
      .eq("route_id", route.id)
      .order("stop_order");
    next.route.stops = (stops ?? []).map((stop) => ({
      label: stop.label ?? "نقطة توقف",
      time: formatTime(stop.scheduled_time),
      lat: toNumber(stop.latitude, schoolLoc.lat),
      lng: toNumber(stop.longitude, schoolLoc.lng),
      studentName: null,
    }));

    const { data: trips } = await supabase
      .from("trips")
      .select("trip_date,status")
      .eq("route_id", route.id)
      .order("trip_date", { ascending: false })
      .limit(1);
    if (trips?.[0]) next.ride = { ...next.ride, date: trips[0].trip_date, status: trips[0].status };

    if (route.bus_id) {
      const { data: buses } = await supabase.from("buses").select("bus_number,plate_number,capacity").eq("id", route.bus_id).limit(1);
      if (buses?.[0]) next.vehicle = { number: buses[0].bus_number, plate: buses[0].plate_number, capacity: buses[0].capacity };
    }
  }

  const { data: studentsData } = await supabase
    .from("students")
    .select("full_name,grade,home_address,home_label,home_latitude,home_longitude,service_status,pickup_contact_name,pickup_contact_phone")
    .eq("school_id", school.id)
    .order("created_at")
    .limit(1);
  const student = studentsData?.[0];
  if (student) {
    next.student = {
      name: student.full_name,
      grade: student.grade ?? "—",
      address: student.home_address ?? "—",
      status: statusLabel(student.service_status),
      location: makeLocation(student.home_label ?? "موقع البيت", student.home_address ?? "—", student.home_latitude, student.home_longitude, schoolLoc),
    };
    next.parent = { ...next.parent, name: student.pickup_contact_name ?? "—", phone: student.pickup_contact_phone ?? "—" };
  }

  const countOf = async (table: string) => (await supabase.from(table).select("id", { count: "exact", head: true }).eq("school_id", school.id)).count ?? 0;
  const [studentsCount, busesCount, routesCount, subscriptionsCount] = await Promise.all(["students", "buses", "routes", "subscriptions"].map(countOf));
  next.counts = { students: studentsCount, buses: busesCount, routes: routesCount, subscriptions: subscriptionsCount };

  next.route = ensureSchoolDestination(next.route, next.school);
  return next;
}

type MyAccess = {
  status: string; full_name: string | null; platform_roles: string[];
  schools: { role: string; status: string; school_status: string }[];
  driver: { status: string } | null;
  guardian: { status: string }[];
};
// الدور يُحدَّد من الخادم عبر my_access() فقط؛ الحساب غير المفعّل لا يحصل على أي دور.
function roleFromAccess(access: MyAccess | null): Role | null {
  if (!access || access.status !== "active") return null;
  if (access.platform_roles.some((r) => r === "super_admin" || r === "executive")) return "executive";
  if (access.schools.some((m) => m.status === "active" && m.school_status === "active")) return "school";
  if (access.driver?.status === "active") return "driver";
  if (access.guardian.some((g) => g.status === "active")) return "parent";
  return null;
}
type UserAccess = { role: Role | null; name: string; email: string; suspended: boolean; platformAdmin: boolean; requestedRole?: string };
async function resolveUserAccess(session: Session): Promise<UserAccess> {
  const email = session.user.email ?? "";
  await supabase.rpc("claim_my_invites");
  const { data, error } = await supabase.rpc("my_access");
  const access = data as MyAccess | null;
  const name = access?.full_name || email.split("@")[0] || "مستخدم";
  const requestedRole = typeof session.user.user_metadata?.requested_role === "string" ? session.user.user_metadata.requested_role : undefined;
  if (error) return { role: null, name, email, suspended: false, platformAdmin: false, requestedRole };
  return { role: roleFromAccess(access), name, email, suspended: access?.status === "suspended", platformAdmin: Boolean(access?.platform_roles.includes("super_admin")), requestedRole };
}

async function loadDriverRows(): Promise<DriverRow[]> {
  const rows: DriverRow[] = [];
  const { data: requests } = await supabase
    .from("driver_onboarding_requests")
    .select("driver_name,phone,email,vehicle_plate,vehicle_capacity,status")
    .order("created_at", { ascending: false })
    .limit(20);
  if (requests?.length) {
    const pending = requests.map((item) => ({
      name: item.driver_name ?? "سائق جديد",
      phone: item.phone ?? "—",
      email: item.email ?? "",
      plate: item.vehicle_plate ?? "—",
      capacity: item.vehicle_capacity ?? 20,
      status: item.status === "pending" ? "بانتظار تفعيل الحساب" : item.status ?? "قيد المراجعة",
      saved: true,
    }));
    return [...pending, ...rows.filter((driver) => !pending.some((item) => item.plate === driver.plate))];
  }
  return rows;
}

async function loadStudentRows(): Promise<StudentRow[]> {
  const rows: StudentRow[] = [];
  const { data: requests } = await supabase
    .from("student_onboarding_requests")
    .select("student_name,grade,parent_name,parent_phone,parent_email,home_address,status")
    .order("created_at", { ascending: false })
    .limit(30);
  if (requests?.length) {
    const pending = requests.map((item) => ({
      name: item.student_name ?? "طالب جديد",
      grade: item.grade ?? "—",
      parentName: item.parent_name ?? "—",
      parentPhone: item.parent_phone ?? "—",
      parentEmail: item.parent_email ?? "",
      address: item.home_address ?? "—",
      status: item.status === "pending_parent_account" ? "بانتظار حساب ولي الأمر" : item.status ?? "قيد المراجعة",
      saved: true,
    }));
    return [...pending, ...rows.filter((student) => !pending.some((item) => item.name === student.name && item.parentPhone === student.parentPhone))];
  }
  return rows;
}

async function loadRouteRows(): Promise<RouteRow[]> {
  const { data: routes } = await supabase
    .from("routes")
    .select("id,name,direction,scheduled_time,is_active,route_stops(label,stop_order)")
    .order("created_at", { ascending: false })
    .limit(20);
  if (!routes?.length) return [];
  return routes.map((route) => {
    const stops = Array.isArray(route.route_stops) ? [...route.route_stops].sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0)).map((stop) => stop.label).filter(Boolean).join(" ← ") : "";
    return {
      name: route.name ?? "مسار",
      direction: route.direction === "to_home" ? "إلى المنزل" : "إلى المدرسة",
      scheduledTime: formatTime(route.scheduled_time) || "—",
      stops: stops || "لم تحدد المحطات",
      status: route.is_active ? "نشط" : "متوقف",
      saved: true,
    };
  });
}

function Stat({ icon: Icon, label, value, detail, accent }: { icon: typeof Users; label: string; value: string; detail: string; accent: string }) {
  return <article className="stat-card"><div className={"stat-icon " + accent}><Icon /></div><div><p className="muted-label">{label}</p><strong className="stat-value">{value}</strong></div><p className="stat-detail">{detail}</p></article>;
}
function LiveRoute({ data, simulation, driverGps, parent = false }: { data: MasariData; simulation: SimulationState; driverGps?: DriverGps | null; parent?: boolean }) {
  const currentStop = data.route.stops[simulation.currentStopIndex] ?? data.route.stops[0];
  const currentPoint = driverGps ?? data.student.location;
  const routePoints = data.route.stops.map((stop) => ({ label: stop.label, address: stop.label, lat: stop.lat, lng: stop.lng }));
  const allMapPoints = [data.school.location, data.student.location, ...routePoints, currentPoint];
  const lats = allMapPoints.map((point)=>point.lat);
  const lngs = allMapPoints.map((point)=>point.lng);
  const bounds = { south: Math.min(...lats) - .025, north: Math.max(...lats) + .025, west: Math.min(...lngs) - .035, east: Math.max(...lngs) + .035 };
  const position = (point: Pick<LocationPoint, "lat" | "lng">) => ({
    left: ((point.lng - bounds.west) / (bounds.east - bounds.west)) * 100,
    top: ((bounds.north - point.lat) / (bounds.north - bounds.south)) * 100,
  });
  const routeSvgPoints = routePoints.map((point)=>{const p=position(point);return `${p.left},${p.top}`}).join(" ");
  const busPosition = position(currentPoint);
  const mapUrl = buildMapUrl(allMapPoints, currentPoint);
  return <article className="panel map-panel">
    <div className="panel-head"><div><p className="eyebrow">تتبع مباشر</p><h2>{parent ? `رحلة ${data.student.name} إلى المدرسة` : `${data.route.name} — ${data.school.city}`}</h2></div><Badge className="live-badge"><span /> {simulation.active ? driverGps ? "GPS مباشر" : "بانتظار GPS" : "بانتظار بدء الرحلة"}</Badge></div>
    <div className="route-map real-map" aria-label="خريطة حقيقية لمسار الباص في شرق الرياض">
      <iframe
        title="خريطة مسار أووك ورد العالمية"
        src={mapUrl}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <svg className="map-route-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points={routeSvgPoints}/></svg>
      <div className="map-stops" aria-label="نقاط التوقف">
        {data.route.stops.map((stop, index) => {const stopPosition=position(stop);return <div className="map-stop" style={{left:`${stopPosition.left}%`,top:`${stopPosition.top}%`}} key={stop.label}>
          <strong>{simulation.approvedStops.includes(index) ? "✓" : index + 1}</strong><span>{stop.label}</span>
        </div>})}
      </div>
      {(!simulation.active || driverGps) ? <div className={`bus-marker ${simulation.active ? "gps-lock moving" : ""}`} style={{left:`${busPosition.left}%`,top:`${busPosition.top}%`}}><BusFront /><span>{driverGps && simulation.active ? "GPS مباشر" : `الباص ${data.vehicle.number}`}</span></div> : <div className="map-gps-warning"><AlertTriangle/> موقع الباص غير متاح</div>}
      <div className="eta-card"><strong>{simulation.active ? currentStop?.time : data.route.scheduledTime}</strong><span>{simulation.active && driverGps ? "موقع الجهاز" : simulation.active ? "بانتظار GPS" : "وقت البداية"}</span></div>
    </div>
    <div className="route-summary">
      <div><span className="summary-dot done"/><p>موعد البداية</p><strong>{data.route.scheduledTime}</strong></div><ChevronLeft />
      <div><span className="summary-dot active"/><p>{driverGps && simulation.active ? "آخر موقع" : simulation.active ? "حالة الموقع" : "المحطة الأولى"}</p><strong>{driverGps && simulation.active ? `${driverGps.lat.toFixed(5)}, ${driverGps.lng.toFixed(5)}` : simulation.active ? "غير متاح" : currentStop?.label ?? data.student.address}</strong></div><ChevronLeft />
      <div><span className="summary-dot"/><p>حالة الطالب</p><strong>{studentStatusLabel[simulation.studentStatus]}</strong></div>
    </div>
  </article>;
}
function LocationEditor({ title, icon: Icon, value, editable, onSave }: { title: string; icon: typeof MapPin; value: LocationPoint; editable: boolean; onSave: (point: LocationPoint) => void }) {
  const [draft, setDraft] = useState(()=>value);
  const update = (key: keyof LocationPoint, next: string) => setDraft((current) => ({ ...current, [key]: key === "lat" || key === "lng" ? Number(next) : next }));
  return <article className="panel location-card">
    <div className="panel-head"><div><p className="eyebrow">{title}</p><h2>{draft.label}</h2></div><Icon className="title-icon" /></div>
    <div className="location-form">
      <label>العنوان<input value={draft.address} disabled={!editable} onChange={(event)=>update("address", event.target.value)} /></label>
      <label>خط العرض<input value={draft.lat} disabled={!editable} type="number" step="0.000001" onChange={(event)=>update("lat", event.target.value)} /></label>
      <label>خط الطول<input value={draft.lng} disabled={!editable} type="number" step="0.000001" onChange={(event)=>update("lng", event.target.value)} /></label>
    </div>
    {editable ? <Button className="wide-action" onClick={()=>onSave(draft)}><Check /> حفظ الموقع</Button> : <p className="readonly-note">هذا الموقع يدار من المدرسة ويظهر لولي الأمر للمتابعة.</p>}
  </article>;
}
function LocationsView({ data, role, simulation, saveStatus, onSaveLocation }: { data: MasariData; role: Role; simulation: SimulationState; saveStatus: string; onSaveLocation: (kind: "school" | "home", point: LocationPoint) => void }) {
  const editable = role === "school" || role === "executive";
  return <>
    <div className="welcome"><div><p className="eyebrow">المواقع الجغرافية</p><h1>موقع المدرسة والبيت والمسار</h1><p>استخدم الإحداثيات الدقيقة عند توفرها من خرائط الجوال، وستنعكس مباشرة على الخريطة وبرج المراقبة.</p></div><Badge className="safe-badge"><MapPin /> {data.source === "supabase" ? "متصل بقاعدة البيانات" : "قابل للتعديل محلياً"}</Badge></div>
    {saveStatus && <div className="save-strip"><Check /><span>{saveStatus}</span></div>}
    {data.school.located === false && <p className="save-strip ops-message ops-error"><MapPin /><span>لم يُحدَّد موقع المدرسة بعد. الإحداثيات الظاهرة افتراضية؛ أدخل موقع المدرسة الصحيح واحفظه، فإنشاء المسارات يعتمد عليه.</span></p>}
    <section className="locations-grid">
      <LocationEditor key={`school-${data.school.location.lat}-${data.school.location.lng}`} title="المدرسة" icon={School} value={data.school.location} editable={editable} onSave={(point)=>onSaveLocation("school", point)} />
      <LocationEditor key={`home-${data.student.location.lat}-${data.student.location.lng}`} title="البيت" icon={MapPin} value={data.student.location} editable={editable} onSave={(point)=>onSaveLocation("home", point)} />
    </section>
    <section className="main-grid location-main"><LiveRoute data={data} simulation={simulation} parent={role === "parent"} /><article className="panel">
      <div className="panel-head"><div><p className="eyebrow">إحداثيات المحطات</p><h2>{data.route.name}</h2></div><Route className="title-icon" /></div>
      {data.route.stops.map((stop, index)=><div className="location-row" key={stop.label}><span>{index + 1}</span><div><strong>{stop.label}</strong><p>{stop.time} · {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}</p></div></div>)}
    </article></section>
  </>;
}
function ExecutiveDashboard({ data, simulation, driverGps }: { data: MasariData; simulation: SimulationState; driverGps?: DriverGps | null }) {
  return <>
    <div className="welcome"><div><p className="eyebrow">{data.school.city} · {data.school.contactName}</p><h1>{data.school.name}</h1><p>نظرة على تشغيل اليوم.</p></div></div>
    <section className="stats-grid">
      <Stat icon={GraduationCap} label="الطلاب المسجلون" value={String(data.counts?.students ?? 0)} detail={`${data.student.name} · ${data.student.grade}`} accent="blue" />
      <Stat icon={BusFront} label="الباصات النشطة" value={String(data.counts?.buses ?? 0)} detail={data.vehicle.capacity ? `${data.vehicle.plate} · ${data.vehicle.capacity} مقعدًا` : "لا يوجد باص مسند للمسار"} accent="teal" />
      <Stat icon={Route} label="المسارات" value={String(data.counts?.routes ?? 0)} detail={`${data.route.name} · ${data.route.stops.length} توقفات`} accent="purple" />
      <Stat icon={CircleDollarSign} label="الاشتراكات" value={String(data.counts?.subscriptions ?? 0)} detail="من قاعدة البيانات" accent="amber" />
    </section>
    <section className="main-grid"><LiveRoute data={data} simulation={simulation} driverGps={driverGps} /><article className="panel operations">
      <div className="panel-head"><div><p className="eyebrow">الآن</p><h2>حالة التشغيل</h2></div><Activity className="title-icon" /></div>
      <div className="operation-ring"><span><strong>{simulation.active ? 1 : 0}</strong><small>{simulation.active ? "رحلة جارية" : "رحلة مجدولة"}</small></span></div>
      <div className="operation-list"><div><span className="dot green"/><p>محطات معتمدة</p><strong>{simulation.approvedStops.length}</strong></div><div><span className="dot amber"/><p>المحطة الحالية</p><strong>{simulation.currentStopIndex + 1}</strong></div><div><span className="dot red"/><p>بيانات ناقصة</p><strong>—</strong></div></div>
    </article></section>
    <section className="lower-grid">
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">آخر 7 أيام</p><h2>الالتزام بالمواعيد</h2></div></div><p className="muted-label">لا توجد رحلات مكتملة كافية لحساب المؤشر بعد.</p></article>
      <article className="panel alerts"><div className="panel-head"><div><p className="eyebrow">تحتاج انتباهك</p><h2>التنبيهات</h2></div><Button variant="ghost" size="sm">عرض الكل</Button></div>
        <div className="alert-row"><span className="alert-icon amber"><Clock3 /></span><div><strong>رحلة اليوم لم تبدأ بعد</strong><p>{data.route.name} · موعد البداية {data.route.scheduledTime}</p></div><small>اليوم</small></div>

      </article>
    </section>
  </>;
}
function DriverDashboard({ data, simulation, tripSaveStatus, driverGps, gpsStatus, onStart, onEnd, onApproveStop, onRefreshGps, onReportIssue, onStudentEvent }: { data: MasariData; simulation: SimulationState; tripSaveStatus: string; driverGps?: DriverGps | null; gpsStatus: string; onStart: () => void; onEnd: () => void; onApproveStop: () => void; onRefreshGps: () => void; onReportIssue: () => void; onStudentEvent: (studentId: string, event: AttendanceEvent) => void }) {
  const currentStop = data.route.stops[simulation.currentStopIndex] ?? data.route.stops[0];
  const finished = simulation.approvedStops.length >= data.route.stops.length;
  const distanceToStop = driverGps && currentStop ? Math.round(distanceMeters(driverGps, currentStop)) : null;
  const allowedDistance = STOP_RADIUS_METERS + Math.min(driverGps?.accuracy ?? 0, 100);
  const withinStopRadius = distanceToStop !== null && distanceToStop <= allowedDistance;
  const canApprove = simulation.active && !finished && withinStopRadius;
  const approveLabel = finished ? "تم اعتماد كل المحطات" : !driverGps ? "فعّل GPS لاعتماد المحطة" : !withinStopRadius ? `تبعد ${distanceToStop}م عن المحطة` : "اعتماد محطة الوصول";
  const BOARDED = ["boarded", "boarded_return", "arrived_school", "dropped_home"];
  const students = data.students
    ? data.students.map((student) => ({ id: student.id, name: student.name, grade: student.grade, status: tripStudentLabel[student.status] ?? student.status, checked: BOARDED.includes(student.status), actions: simulation.active ? attendanceActions(data.trip?.direction, student.status) : [] }))
    : [{ id: "", name: data.student.name, grade: data.student.grade, status: studentStatusLabel[simulation.studentStatus], checked: simulation.studentStatus === "on_bus" || simulation.studentStatus === "arrived", actions: [] as { event: AttendanceEvent; label: string }[] }];
  const tripDone = data.trip?.status === "completed";
  return <>
    <div className="welcome driver-welcome"><div><p className="eyebrow">مسارك اليوم</p><h1>{data.trip?.direction === "to_home" ? "رحلة العودة" : "الرحلة الصباحية"} — {data.route.name}</h1><p>{data.route.stops.length} محطات · {students.length === 1 ? "طالب واحد" : `${students.length} طلاب`} · الباص {data.vehicle.number}</p></div>{tripDone ? <Badge className="safe-badge"><Check/> انتهت رحلة اليوم</Badge> : <Button className={simulation.active ? "danger-action" : "primary-action"} onClick={simulation.active ? onEnd : onStart}>{simulation.active ? <><X/> إنهاء الرحلة</> : <><Navigation/> بدء الرحلة وتفعيل الموقع</>}</Button>}</div>
    {simulation.active && <div className={`trip-live-strip ${driverGps ? "" : "gps-missing"}`}><span/><strong>{driverGps ? "GPS فعّال الآن" : "الرحلة بدأت والموقع غير متاح"}</strong><p>{driverGps ? "اعتماد المحطة متاح داخل نطاق 250 متر فقط" : "اسمح للموقع من إعدادات المتصفح، ثم اضغط تحديث GPS"}</p></div>}
    {tripSaveStatus && <div className="save-strip trip-save"><Check/><span>{tripSaveStatus}</span></div>}
    <article className="panel gps-panel">
      <div><p className="eyebrow">GPS الجهاز</p><strong>{driverGps ? "تم التقاط موقع السائق" : "بانتظار السماح بالموقع"}</strong><span>{gpsStatus || "اضغط بدء الرحلة وسيطلب المتصفح إذن الموقع."}</span></div>
      {driverGps && <div className="gps-coords"><MapPin/><span>{driverGps.lat.toFixed(5)}, {driverGps.lng.toFixed(5)}</span><small>دقة {Math.round(driverGps.accuracy ?? 0)}م</small></div>}
      <Button variant="outline" onClick={onRefreshGps}><Navigation/> تحديث GPS الآن</Button>
    </article>
    <section className="driver-grid"><article className="panel stops">
      <div className="panel-head"><div><p className="eyebrow">{finished ? "اكتملت الرحلة" : "المحطة الحالية"}</p><h2>{finished ? data.school.name : currentStop?.label}</h2></div><div className="eta-pill">{finished ? "تم" : currentStop?.time}</div></div>
      <div className="stop-progress"><Progress value={data.route.stops.length ? (simulation.approvedStops.length / data.route.stops.length) * 100 : 0}/><span>{simulation.approvedStops.length} من {data.route.stops.length} محطات معتمدة</span></div>
      <div className="student-checklist">{students.length===0&&<p className="muted-label">لا يوجد طلاب في هذه الرحلة.</p>}{students.map((student)=><div key={student.id || student.name} className={"check-row "+(student.checked?"checked":"")}><span className="student-avatar">{student.name.charAt(0)}</span><div><strong>{student.name}</strong><p>{student.grade} · {student.status}</p></div>{student.actions.length ? <span className="student-actions">{student.actions.map((action)=><Button key={action.event} size="sm" variant="outline" onClick={()=>onStudentEvent(student.id, action.event)}>{action.label}</Button>)}</span> : <span className="check-box">{student.checked && <Check/>}</span>}</div>)}</div>
      {!finished && <p className={`geofence-status ${withinStopRadius ? "ready" : "blocked"}`}><MapPin/>{distanceToStop === null ? "لا يمكن الاعتماد دون موقع GPS فعلي" : withinStopRadius ? `داخل نطاق المحطة · ${distanceToStop} متر` : `اقترب حتى 250 متر من ${currentStop?.label}`}</p>}
      <Button className="wide-action" disabled={!canApprove} onClick={onApproveStop}><Check/> {approveLabel}</Button>
    </article><article className="panel compact-route"><div className="panel-head"><div><p className="eyebrow">تسلسل الرحلة</p><h2>نقاط التوقف</h2></div></div>
      {data.route.stops.map((stop,i)=><div className={"timeline-row "+(simulation.approvedStops.includes(i)?"passed":i===simulation.currentStopIndex?"current":"")} key={stop.id ?? `${stop.label}-${i}`}><span>{simulation.approvedStops.includes(i)?<Check/>:i+1}</span><div><strong>{stop.label}</strong><p>{stop.time}</p></div></div>)}
      <Button variant="outline" className="report-btn" disabled={!simulation.active} onClick={onReportIssue}><AlertTriangle/> إرسال بلاغ طارئ</Button>
    </article></section>
  </>;
}
function FeedbackPanel({ data, feedbackRows, onSubmit }: { data: MasariData; feedbackRows: FeedbackItem[]; authMode: AuthMode; onSubmit: (feedback: Omit<FeedbackItem, "id" | "createdAt" | "saved">) => Promise<void> }) {
  const [rating, setRating] = useState(5);
  const [category, setCategory] = useState("تقييم الخدمة");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const canSend = message.trim().length >= 6;
  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    setStatus("");
    await onSubmit({ author: data.parent.name, role: "parent", rating, category, message: message.trim(), status: "جديد" });
    setBusy(false);
    setMessage("");
    setStatus("تم إرسال الملاحظة للإدارة.");
    setTimeout(()=>setStatus(""), 4200);
  };
  return <article className="panel feedback-panel">
    <div className="panel-head"><div><p className="eyebrow">تواصل وتقييم</p><h2>أرسل ملاحظة للإدارة</h2></div><MessageSquareText className="title-icon"/></div>
    <div className="feedback-form">
      <label>نوع الرسالة<select value={category} onChange={(event)=>setCategory(event.target.value)}><option>تقييم الخدمة</option><option>شكوى</option><option>اقتراح</option><option>استفسار</option></select></label>
      <label>التقييم<select value={rating} onChange={(event)=>setRating(Number(event.target.value))}>{[5,4,3,2,1].map((value)=><option value={value} key={value}>{value} من 5</option>)}</select></label>
      <label className="wide-field">الرسالة<textarea value={message} onChange={(event)=>setMessage(event.target.value)} placeholder={`اكتب ملاحظتك عن رحلة ${data.student.name}`}/></label>
    </div>
    {status && <p className="save-strip compact"><Check/><span>{status}</span></p>}
    <Button className="wide-action" disabled={!canSend || busy} onClick={()=>void submit()}><MessageSquareText/> {busy ? "جارٍ الإرسال…" : "إرسال للإدارة"}</Button>
    <div className="feedback-list">{feedbackRows.slice(0,3).map((item)=><div className="feedback-item" key={item.id}><div><strong>{item.category}</strong><p>{item.message}</p></div><Badge className="status-badge tone-2">{item.status}</Badge></div>)}</div>
  </article>;
}

function ParentDashboard({ data, simulation, driverGps, tripEvents, feedbackRows, authMode, tripSaveStatus, onSubmitFeedback, onSelectChild, onSetAbsence }: { data: MasariData; simulation: SimulationState; driverGps?: DriverGps | null; tripEvents: TripEventRow[]; feedbackRows: FeedbackItem[]; authMode: AuthMode; tripSaveStatus: string; onSubmitFeedback: (feedback: Omit<FeedbackItem, "id" | "createdAt" | "saved">) => Promise<void>; onSelectChild: (childId: string) => void; onSetAbsence: (absent: boolean) => Promise<void> }) {
  const [absenceBusy, setAbsenceBusy] = useState(false);
  const changeAbsence = async (absent: boolean) => { setAbsenceBusy(true); try { await onSetAbsence(absent); } finally { setAbsenceBusy(false); } };
  const myStatus = data.students?.find((child) => child.id === data.student.id)?.status;
  const childTripStatus = data.trip && (data.trip.status !== "scheduled" || myStatus === "absent") ? myStatus : undefined;
  const childStatus = childTripStatus ? tripStudentLabel[childTripStatus] ?? childTripStatus
    : authMode === "authenticated" && !data.trip ? (data.route.stops.length ? "لا توجد رحلة اليوم" : "لم يُسند إلى مسار بعد")
    : studentStatusLabel[simulation.studentStatus];
  const currentStop = data.route.stops[simulation.currentStopIndex] ?? data.route.stops[0];
  const real = authMode === "authenticated";
  const badge = real ? tripBadge(data.trip?.status) : { text: "الرحلة آمنة", tone: "safe" as const };
  const canChangeAbsence = real && data.trip && (data.trip.status === "scheduled" || data.trip.status === "ready");
  const children = real && data.students && data.students.length > 1 ? data.students : [];
  const events = tripEvents.length ? tripEvents : [
    { eventType: "note", note: simulation.active ? "تم تفعيل تتبع الباص" : `تمت جدولة رحلة ${data.student.name}`, createdAt: new Date().toISOString() },
    { eventType: "note", note: `${studentStatusLabel[simulation.studentStatus]} · ${simulation.approvedStops.length} من ${data.route.stops.length} محطات معتمدة`, createdAt: new Date().toISOString() },
  ];
  return <>
    <div className="welcome"><div><p className="eyebrow">صباح الخير يا {data.parent.name}</p><h1>{data.student.name}: {childStatus}</h1><p>{simulation.active ? `الباص عند ${currentStop?.label}` : [data.route.name, data.driver.name !== "—" && `السائق ${data.driver.name}`, data.vehicle.number !== "—" && `الباص ${data.vehicle.number}`].filter(Boolean).join(" · ")}</p></div><Badge className={`safe-badge tone-${badge.tone}`}>{badge.tone === "danger" ? <AlertTriangle/> : <ShieldCheck/>} {badge.text}</Badge></div>
    {children.length > 0 && <div className="child-switcher" role="tablist" aria-label="الأبناء">{children.map((child)=><button key={child.id} role="tab" aria-selected={child.id === data.student.id} className={child.id === data.student.id ? "active" : ""} onClick={()=>onSelectChild(child.id)}>{child.name}</button>)}</div>}
    {tripSaveStatus && <div className="save-strip trip-save"><Check/><span>{tripSaveStatus}</span></div>}
    {real && <PushToggle/>}
    {canChangeAbsence && <article className="panel absence-panel"><div><p className="eyebrow">رحلة اليوم لم تبدأ بعد</p><strong>{myStatus === "absent" ? `${data.student.name} مسجل غائبًا اليوم` : `هل ${data.student.name} غائب اليوم؟`}</strong><span>{myStatus === "absent" ? "لن ينتظره السائق في المحطة." : "سجّل الغياب قبل بدء الرحلة حتى لا ينتظره السائق."}</span></div>{myStatus === "absent" ? <Button variant="outline" disabled={absenceBusy} onClick={()=>void changeAbsence(false)}>{absenceBusy ? "جارٍ الحفظ…" : "إلغاء الغياب"}</Button> : <Button className="danger-action" disabled={absenceBusy} onClick={()=>void changeAbsence(true)}>{absenceBusy ? "جارٍ الحفظ…" : "ابني غائب اليوم"}</Button>}</article>}
    <LiveRoute data={data} simulation={simulation} driverGps={driverGps} parent />
    <section className="lower-grid parent-lower"><article className="panel child-card"><div className="student-avatar big">{data.student.name.charAt(0)}</div><div><p className="eyebrow">الطالب</p><h2>{data.student.name}</h2><p>{data.student.grade} · {data.school.name}</p></div><Badge className="onbus">{childStatus}</Badge></article>
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">اليوم</p><h2>تحديثات الرحلة</h2></div><Bell className="title-icon"/></div>{events.slice(0,4).map((event, index)=><div className={`event ${event.eventType === "emergency" ? "emergency-event" : ""}`} key={event.id ?? `${event.eventType}-${index}`}><span className={index === 0 ? "done" : ""}>{event.eventType === "emergency" ? <AlertTriangle/> : event.eventType === "pickup" || event.eventType === "dropoff" ? <Check/> : <Navigation/>}</span><div><strong>{eventTypeLabel(event.eventType)}</strong><p>{event.note || currentStop?.label} · {formatEventTime(event.createdAt)}</p></div></div>)}</article>
    </section>
    <FeedbackPanel data={data} feedbackRows={feedbackRows} authMode={authMode} onSubmit={onSubmitFeedback}/>
  </>;
}
function AddDriverPanel({ onAdd }: { onAdd: (driver: DriverForm) => Promise<void>; authMode: AuthMode }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", plate: "", status: "قيد المراجعة" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdd = form.name.trim() && form.phone.trim() && form.plate.trim();
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setBusy(true); setMessage("");
    try { await onAdd(form); } catch { setBusy(false); setMessage("تعذر حفظ الطلب. تحقق من البيانات وحاول مرة أخرى."); return; }
    setBusy(false);
    setMessage("تم حفظ طلب السائق. اعتمده من «التشغيل اليومي».");
    setForm({ name: "", phone: "", email: "", plate: "", status: "قيد المراجعة" });
    setTimeout(()=>setMessage(""), 4200);
  };
  return <article className="panel add-driver-panel">
    <div className="panel-head"><div><p className="eyebrow">إدارة المدرسة</p><h2>إضافة سائق جديد</h2></div><UserPlus className="title-icon"/></div>
    <div className="driver-form">
      <label>اسم السائق<input value={form.name} onChange={(e)=>update("name", e.target.value)} placeholder="مثال: محمد السبيعي"/></label>
      <label>الجوال<input value={form.phone} onChange={(e)=>update("phone", e.target.value)} placeholder="05xxxxxxxx"/></label>
      <label>البريد الإلكتروني<input value={form.email} onChange={(e)=>update("email", e.target.value)} placeholder="driver@example.com"/></label>
      <label>لوحة الباص<input value={form.plate} onChange={(e)=>update("plate", e.target.value)} placeholder="أ ب ج 1234"/></label>
    </div>
    {message && <p className="save-strip compact"><Check/><span>{message}</span></p>}
    <Button className="wide-action" disabled={!canAdd || busy} onClick={()=>void submit()}><Plus/> {busy ? "جارٍ الحفظ…" : "حفظ طلب السائق"}</Button>
  </article>;
}

function AddStudentPanel({ onAdd }: { onAdd: (student: StudentForm) => Promise<void>; authMode: AuthMode }) {
  const [form, setForm] = useState({ name: "", grade: "", parentName: "", parentPhone: "", parentEmail: "", address: "", status: "قيد المراجعة" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdd = form.name.trim() && form.grade.trim() && form.parentPhone.trim() && form.address.trim();
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setBusy(true); setMessage("");
    try { await onAdd(form); } catch { setBusy(false); setMessage("تعذر حفظ الطلب. تحقق من البيانات وحاول مرة أخرى."); return; }
    setBusy(false);
    setMessage("تم حفظ طلب الطالب. اعتمده من «التشغيل اليومي».");
    setForm({ name: "", grade: "", parentName: "", parentPhone: "", parentEmail: "", address: "", status: "قيد المراجعة" });
    setTimeout(()=>setMessage(""), 4200);
  };
  return <article className="panel add-driver-panel">
    <div className="panel-head"><div><p className="eyebrow">إدارة المدرسة</p><h2>إضافة طالب جديد</h2></div><GraduationCap className="title-icon"/></div>
    <div className="driver-form student-form">
      <label>اسم الطالب<input value={form.name} onChange={(e)=>update("name", e.target.value)} placeholder="مثال: نورة"/></label>
      <label>الصف<input value={form.grade} onChange={(e)=>update("grade", e.target.value)} placeholder="Kg3"/></label>
      <label>ولي الأمر<input value={form.parentName} onChange={(e)=>update("parentName", e.target.value)} placeholder="اسم ولي الأمر"/></label>
      <label>جوال ولي الأمر<input value={form.parentPhone} onChange={(e)=>update("parentPhone", e.target.value)} placeholder="05xxxxxxxx"/></label>
      <label>بريد ولي الأمر<input value={form.parentEmail} onChange={(e)=>update("parentEmail", e.target.value)} placeholder="parent@example.com"/></label>
      <label>عنوان البيت<input value={form.address} onChange={(e)=>update("address", e.target.value)} placeholder="الحي والشارع"/></label>
    </div>
    {message && <p className="save-strip compact"><Check/><span>{message}</span></p>}
    <Button className="wide-action" disabled={!canAdd || busy} onClick={()=>void submit()}><Plus/> {busy ? "جارٍ الحفظ…" : "حفظ طلب الطالب"}</Button>
  </article>;
}

function AddRoutePanel({ onAdd }: { onAdd: (route: RouteForm) => Promise<void>; authMode: AuthMode }) {
  const [form, setForm] = useState<RouteForm>({ name: "", direction: "to_school", scheduledTime: "06:30", stopsText: "", status: "قيد الإعداد" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdd = form.name.trim() && form.scheduledTime.trim() && form.stopsText.split("\n").filter((line)=>line.trim()).length >= 2;
  const update = (key: keyof RouteForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setBusy(true); setMessage("");
    await onAdd(form);
    setBusy(false);
    setMessage("تم حفظ المسار ومحطاته.");
    setForm({ name: "", direction: "to_school", scheduledTime: "06:30", stopsText: "", status: "قيد الإعداد" });
    setTimeout(()=>setMessage(""), 4200);
  };
  return <article className="panel add-driver-panel">
    <div className="panel-head"><div><p className="eyebrow">إدارة المدرسة</p><h2>إنشاء مسار جديد</h2></div><Route className="title-icon"/></div>
    <div className="driver-form route-form">
      <label>اسم المسار<input value={form.name} onChange={(e)=>update("name", e.target.value)} placeholder="مثال: مسار 2"/></label>
      <label>الاتجاه<select value={form.direction} onChange={(e)=>update("direction", e.target.value)}><option value="to_school">إلى المدرسة</option><option value="to_home">إلى المنزل</option></select></label>
      <label>وقت البداية<input value={form.scheduledTime} type="time" onChange={(e)=>update("scheduledTime", e.target.value)} /></label>
      <label className="wide-field">المحطات، كل محطة في سطر<textarea value={form.stopsText} onChange={(e)=>update("stopsText", e.target.value)} placeholder={"الروضة\nالنهضة\nالنسيم - شارع عبدالله بن عمر"} /></label>
    </div>
    {message && <p className="save-strip compact"><Check/><span>{message}</span></p>}
    <Button className="wide-action" disabled={!canAdd || busy} onClick={()=>void submit()}><Plus/> {busy ? "جارٍ الحفظ…" : "حفظ المسار"}</Button>
  </article>;
}

function ControlTower({ data, simulation, driverGps, tripEvents }: { data: MasariData; simulation: SimulationState; driverGps?: DriverGps | null; tripEvents: TripEventRow[] }) {
  const currentStop = data.route.stops[simulation.currentStopIndex] ?? data.route.stops[0];
  const events: TripEventRow[] = tripEvents.length ? tripEvents : data.route.stops.map((stop, index)=>({
    eventType: simulation.approvedStops.includes(index) ? "note" : "scheduled",
    note: `${stop.label} · ${simulation.approvedStops.includes(index) ? "تم اعتماد الوصول" : index === simulation.currentStopIndex ? "المحطة الحالية" : "بانتظار الوصول"}`,
    createdAt: new Date().toISOString(),
  }));
  return <>
    <div className="welcome"><div><p className="eyebrow">مركز العمليات</p><h1>برج مراقبة النقل المدرسي</h1><p>متابعة الرحلات، حالة الموقع، واعتمادات المحطات من شاشة واحدة.</p></div><Badge className="safe-badge"><RadioTower/> {simulation.active ? "متابعة مباشرة" : "لا توجد رحلة جارية"}</Badge></div>
    <section className="main-grid"><LiveRoute data={data} simulation={simulation} driverGps={driverGps}/><article className="panel control-status">
      <div className="panel-head"><div><p className="eyebrow">رحلة اليوم</p><h2>{data.route.name}</h2></div><Activity className="title-icon"/></div>
      <div className="control-metric"><strong>{simulation.approvedStops.length}/{data.route.stops.length}</strong><span>محطات معتمدة</span></div>
      <div className="operation-list"><div><span className={`dot ${driverGps ? "green" : "red"}`}/><p>حالة الموقع</p><strong>{driverGps ? "GPS مباشر" : simulation.active ? "غير متاح" : "متوقف"}</strong></div><div><span className="dot amber"/><p>المحطة الحالية</p><strong>{driverGps ? "موقع السائق" : currentStop?.label}</strong></div><div><span className="dot red"/><p>حالة الطالب</p><strong>{studentStatusLabel[simulation.studentStatus]}</strong></div></div>
    </article></section>
    <section className="lower-grid"><article className="panel"><div className="panel-head"><div><p className="eyebrow">السائق والباص</p><h2>{data.driver.name}</h2></div><BusFront className="title-icon"/></div><div className="tower-list"><div><span>الباص</span><strong>{data.vehicle.number}</strong></div><div><span>اللوحة</span><strong>{data.vehicle.plate}</strong></div><div><span>السعة</span><strong>{data.vehicle.capacity} مقعدًا</strong></div></div></article>
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">سجل سريع</p><h2>أحداث الرحلة</h2></div><FileClock className="title-icon"/></div>{events.slice(0,6).map((event, index)=><div className={`event ${event.eventType === "emergency" ? "emergency-event" : ""}`} key={event.id ?? `${event.note}-${index}`}><span className={index === 0 ? "done" : ""}>{event.eventType === "emergency" ? <AlertTriangle/> : event.eventType === "pickup" || event.eventType === "dropoff" ? <Check/> : index + 1}</span><div><strong>{eventTypeLabel(event.eventType)}</strong><p>{event.note} · {formatEventTime(event.createdAt)}</p></div></div>)}</article>
    </section>
  </>;
}

function DataView({ data, view, role, simulation, extraDrivers, studentRows, routeRows, tripEvents, feedbackRows, onAddDriver, onAddStudent, onAddRoute, authMode }: { data: MasariData; view: View; role: Role; simulation: SimulationState; extraDrivers: DriverRow[]; studentRows: StudentRow[]; routeRows: RouteRow[]; tripEvents: TripEventRow[]; feedbackRows: FeedbackItem[]; onAddDriver: (driver: DriverForm) => Promise<void>; onAddStudent: (student: StudentForm) => Promise<void>; onAddRoute: (route: RouteForm) => Promise<void>; authMode: AuthMode }) {
  const config: Record<string,{title:string;subtitle:string;action:string;icon:typeof School}> = {
    schools:{title:"المدارس والفروع",subtitle:"إدارة المدارس المرتبطة بخدمة النقل",action:"إضافة مدرسة",icon:School},
    students:{title:"الطلاب",subtitle:"بيانات الطلاب وحالة النقل والاشتراك",action:"إضافة طالب",icon:GraduationCap},
    fleet:{title:"الأسطول والسائقون",subtitle:"إدارة الباصات والسائقين والتراخيص",action:"إضافة باص",icon:BusFront},
    routes:{title:"المسارات",subtitle:"المسارات النشطة ونقاط التوقف",action:"إنشاء مسار",icon:Route},
    trips:{title:"الرحلات",subtitle:"متابعة الرحلات اليومية وسجل الحضور",action:"جدولة رحلة",icon:Navigation},
    finance:{title:"الاشتراكات والمدفوعات",subtitle:"متابعة الاشتراكات والتحصيل",action:"إضافة اشتراك",icon:WalletCards},
    reports:{title:"التقارير",subtitle:"مؤشرات الأداء والتشغيل عبر الزمن",action:"تصدير التقرير",icon:BarChart3},
    audit:{title:"سجل التدقيق",subtitle:"جميع العمليات الحساسة المسجلة في النظام",action:"تصفية السجل",icon:FileClock},
  };
  const c=config[view] ?? config.students; const Icon=c.icon;
  const noData = data.source === "empty";
  const rows: string[][] = noData && ["schools","finance","audit"].includes(view) ? [] : view==="schools" ? [[data.school.name, `${data.school.city} · ${data.school.contactName}`, "نشط", "اليوم"]]
    : view==="fleet" ? extraDrivers.map((driver)=>[`${driver.name} · ${driver.plate}`, `${driver.email || driver.phone} · ${driver.capacity ?? data.vehicle.capacity} مقعدًا`, driver.status, driver.saved ? "محفوظ" : "محلي"])
    : view==="routes" ? routeRows.map((route)=>[route.name, `${route.direction} · ${route.stops}`, route.status, route.saved ? route.scheduledTime : "محلي"])
    : view==="trips" ? (tripEvents.length ? tripEvents.map((event)=>[eventTypeLabel(event.eventType), event.note || `${data.student.name} · ${data.student.address}`, event.eventType === "pickup" ? "حضور" : event.eventType === "dropoff" ? "انصراف" : event.eventType === "emergency" ? "طارئ" : "تحديث", formatEventTime(event.createdAt)]) : noData ? [] : [[`رحلة ${data.route.name}`, `${data.student.name} · ${data.student.address}`, statusLabel(data.ride.status), data.ride.date]])
    : view==="finance" ? []
    : view==="reports" ? feedbackRows.map((item)=>[`${item.category} · ${item.rating}/5`, `${item.author} · ${item.message}`, item.status, formatEventTime(item.createdAt)])
    : view==="audit" ? []
    : studentRows.map((student)=>[student.name, `${student.grade} · ${student.parentName || "ولي الأمر"} · ${student.address}`, student.status, student.saved ? "محفوظ" : "محلي"]);
  const canManage = role === "school" || role === "executive";
  return <><div className="welcome"><div><p className="eyebrow">إدارة النظام</p><h1>{c.title}</h1><p>{c.subtitle}</p></div><Button className="primary-action"><Plus/>{c.action}</Button></div>{view==="trips"&&<section className="trip-summary-grid"><article className="panel mini-metric"><span>أحداث اليوم</span><strong>{tripEvents.length || simulation.approvedStops.length}</strong></article><article className="panel mini-metric"><span>حالة الطالب</span><strong>{studentStatusLabel[simulation.studentStatus]}</strong></article><article className="panel mini-metric"><span>آخر تحديث</span><strong>{tripEvents[0] ? formatEventTime(tripEvents[0].createdAt) : "—"}</strong></article></section>}{view==="fleet"&&canManage&&<AddDriverPanel onAdd={onAddDriver} authMode={authMode}/>} {view==="students"&&canManage&&<AddStudentPanel onAdd={onAddStudent} authMode={authMode}/>} {view==="routes"&&canManage&&(authMode==="authenticated" ? <p className="save-strip compact"><Route/><span>إنشاء المسارات ومحطاتها بالإحداثيات من صفحة «التشغيل اليومي».</span></p> : <AddRoutePanel onAdd={onAddRoute} authMode={authMode}/>)}<article className="panel data-panel"><div className="data-tools"><div className="search-box"><Search/><input aria-label="بحث" placeholder="ابحث بالاسم أو الرقم…"/></div><Button variant="outline">الحالة: الكل</Button></div><div className="data-table"><div className="table-head"><span>الاسم / البيان</span><span>التفاصيل</span><span>الحالة</span><span>آخر تحديث</span></div>{rows.length===0&&<div className="table-row table-empty"><span>لا توجد سجلات بعد.</span></div>}{rows.map((row,i)=><div className="table-row" key={i}><span><span className="row-icon"><Icon/></span><strong>{row[0]}</strong></span><span>{row[1]}</span><span><Badge className={"status-badge tone-"+(i%3)}>{row[2]}</Badge></span><span>{row[3]}</span></div>)}</div></article></>;
}
function EmptyState({ role }: { role: Role }) {
  const hint = role === "parent" ? "لم يُربط حسابك بأي طالب بعد. ستظهر الرحلة هنا بعد أن تربطك المدرسة بابنك."
    : role === "driver" ? "لا توجد رحلات مسندة إليك بعد. ستظهر رحلة اليوم بعد أن تسندك المدرسة إلى مسار."
    : "لا توجد بيانات تشغيل بعد. أضف مدرسة ثم الباصات والمسارات والطلاب لتظهر هنا.";
  return <article className="panel empty-state"><div className="brand-mark large"><School/></div><h2>لا توجد بيانات بعد</h2><p>{hint}</p></article>;
}
function LoginDialog({ onClose, onAuthenticated }: { onClose:()=>void; onAuthenticated: (session: Session) => Promise<void> }) {
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  const login=async()=>{
    setBusy(true); setMessage("");
    const {data,error}=await supabase.auth.signInWithPassword({email,password});
    if(error||!data.session){setBusy(false);setMessage("تعذر تسجيل الدخول. تحقق من البيانات.");return}
    try {
      await onAuthenticated(data.session);
      setMessage("تم تسجيل الدخول بنجاح.");
      setTimeout(onClose,500);
    } catch {
      setMessage("الحساب صحيح لكنه بانتظار التفعيل وربطه بدور معتمد من الإدارة.");
      await supabase.auth.signOut({ scope: "local" });
    } finally { setBusy(false); }
  };
  const [forgot,setForgot]=useState(false);
  if(forgot) return <div className="login-backdrop"><div className="login-card"><button className="close-login" onClick={onClose}><X/></button><ForgotPassword initialEmail={email} onBack={()=>setForgot(false)}/></div></div>;
  return <div className="login-backdrop"><div className="login-card"><button className="close-login" onClick={onClose}><X/></button><div className="brand-mark large"><BusFront/></div><p className="eyebrow">مرحبًا بك</p><h2>تسجيل الدخول إلى مساري</h2><p>استخدم الحساب المسجل لدى المدرسة أو شركة النقل.</p><label>البريد الإلكتروني<input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="name@example.com"/></label><label>كلمة المرور<input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••"/></label>{message&&<p className="login-message">{message}</p>}<Button className="wide-action" onClick={login} disabled={busy||!email||!password}>{busy?"جارٍ الدخول…":"تسجيل الدخول"}</Button><button className="text-link" onClick={()=>setForgot(true)}>نسيت كلمة المرور؟</button></div></div>;
}
function AuthPage({ onAuthenticated, initialMode = "login", initialRole = "parent", onBack }: { onAuthenticated: (session: Session) => Promise<void>; initialMode?: "login" | "signup"; initialRole?: Role; onBack?: () => void }) {
  const [selectedRole, setSelectedRole] = useState<Role>(initialRole);
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const roleOptions: { role: Role; title: string; desc: string; icon: typeof Users }[] = [
    { role: "parent", title: "ولي الأمر", desc: "متابعة الطالب والرحلة والتنبيهات", icon: Users },
    { role: "school", title: "المدرسة", desc: "إدارة الطلاب والسائقين والمسارات", icon: School },
    { role: "executive", title: "الإدارة التنفيذية", desc: "التقارير وبرج المراقبة لكل العمليات", icon: ShieldCheck },
    { role: "driver", title: "السائق", desc: "بدء الرحلة واعتماد المحطات", icon: BusFront },
  ];
  const SelectedIcon = roleOptions.find((item)=>item.role===selectedRole)?.icon ?? Users;
  const submitAuth = async () => {
    setBusy(true); setMessage("");
    const credentials = { email: email.trim(), password };
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp({ ...credentials, options: { data: { full_name: name, requested_role: selectedRole } } });
    setBusy(false);
    if (result.error) {
      setMessage(mode === "login" ? "تعذر تسجيل الدخول. تأكد من البريد وكلمة المرور." : "تعذر إنشاء الحساب. قد يكون البريد مستخدمًا أو كلمة المرور قصيرة.");
      return;
    }
    if (result.data.session) {
      try {
        await onAuthenticated(result.data.session);
      } catch {
        setMessage(mode === "login" ? "الحساب صحيح لكنه بانتظار التفعيل وربطه بدور معتمد من الإدارة." : "تم إنشاء الحساب بأمان، وهو الآن بانتظار اعتماد الإدارة وربطه بالدور المطلوب.");
        await supabase.auth.signOut({ scope: "local" });
      }
    } else setMessage("تم إنشاء الحساب. فعّل البريد ثم انتظر اعتماد الإدارة قبل تسجيل الدخول.");
  };
  return <main dir="rtl" className="auth-page">
    <section className="auth-hero">{onBack&&<button className="auth-back" onClick={onBack}>→ الصفحة الرئيسية</button>}<div className="brand-mark large"><BusFront/></div><p className="eyebrow">مساري</p><h1>تسجيل الدخول وإدارة النقل المدرسي</h1><p>ادخل بحسابك لمتابعة الرحلات وإدارة النقل المدرسي حسب دورك: المدرسة، ولي الأمر، السائق، أو الإدارة.</p></section>
    <section className="auth-shell">
      <div className="auth-tabs"><button className={mode==="login"?"active":""} onClick={()=>setMode("login")}>تسجيل الدخول</button><button className={mode==="signup"?"active":""} onClick={()=>setMode("signup")}>تسجيل جديد</button></div>
      <div className="role-cards">{roleOptions.map((item)=><button key={item.role} className={selectedRole===item.role?"active":""} onClick={()=>setSelectedRole(item.role)}><item.icon/><strong>{item.title}</strong><span>{item.desc}</span></button>)}</div>
      <div className="auth-form-card">{forgot ? <ForgotPassword initialEmail={email} onBack={()=>setForgot(false)}/> : <><div className="auth-form-head"><SelectedIcon/><div><p className="eyebrow">{mode==="login"?"دخول":"إنشاء حساب"}</p><h2>{roleNames[selectedRole]}</h2></div></div>
        <label>البريد الإلكتروني<input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" placeholder="name@example.com"/></label>
        <label>كلمة المرور<input value={password} onChange={(e)=>setPassword(e.target.value)} type="password" placeholder="••••••••"/></label>
        {mode==="signup"&&<label>اسم الجهة / المستخدم<input value={name} onChange={(e)=>setName(e.target.value)} placeholder={selectedRole==="school"?"اسم المدرسة":"الاسم الكامل"}/></label>}
        {message&&<p className="auth-message">{message}</p>}
        <Button className="wide-action" onClick={submitAuth} disabled={busy || !email.trim() || password.length < (mode==="signup" ? 8 : 6)}>{busy ? "جارٍ التحقق…" : mode==="login" ? "تسجيل الدخول" : "إنشاء حساب"}</Button>
        {mode==="login" ? <button className="text-link" onClick={()=>setForgot(true)}>نسيت كلمة المرور؟</button> : password.length > 0 && password.length < 8 && <p className="muted-label">كلمة المرور 8 أحرف على الأقل.</p>}
      </>}</div>
    </section>
  </main>;
}
// رابط الاستعادة يُقرأ من العنوان في المتصفح فقط (لا يتعارض مع العرض على الخادم).
const noopSubscribe = () => () => {};
export default function Home() {
  const [entered,setEntered]=useState(false); const [role,setRole]=useState<Role>("executive"); const [view,setView]=useState<View>("dashboard"); const [login,setLogin]=useState(false); const [online,setOnline]=useState(()=>typeof navigator === "undefined" ? true : navigator.onLine); const [data,setData]=useState<MasariData>(blankData); const [simulation,setSimulation]=useState<SimulationState>(initialSimulation); const [extraDrivers,setExtraDrivers]=useState<DriverRow[]>([]); const [studentRows,setStudentRows]=useState<StudentRow[]>([]); const [routeRows,setRouteRows]=useState<RouteRow[]>([]); const [feedbackRows,setFeedbackRows]=useState<FeedbackItem[]>([]); const [saveStatus,setSaveStatus]=useState(""); const [tripSaveStatus,setTripSaveStatus]=useState(""); const [gpsStatus,setGpsStatus]=useState(""); const [driverGps,setDriverGps]=useState<DriverGps | null>(null); const [tripEvents,setTripEvents]=useState<TripEventRow[]>([]); const [notificationsOpen,setNotificationsOpen]=useState(false); const [activeTripContext,setActiveTripContext]=useState<TripContext | null>(null); const [authMode,setAuthMode]=useState<AuthMode>("demo"); const [accountName,setAccountName]=useState(""); const [pendingAccount,setPendingAccount]=useState<UserAccess | null>(null); const recoveryLink=useSyncExternalStore(noopSubscribe,isRecoveryLink,()=>false); const [recoveryEvent,setRecoveryEvent]=useState(false); const [recoveryClosed,setRecoveryClosed]=useState(false); const recovering=!recoveryClosed&&(recoveryLink||recoveryEvent); const [platformAdmin,setPlatformAdmin]=useState(false); const [authView,setAuthView]=useState<"landing"|"login"|"school">("landing");
  const gpsWatchRef = useRef<number | null>(null);
  const lastGpsSaveRef = useRef(0);
  const statusTimerRef = useRef<number | null>(null);
  const selectedChildRef = useRef<string | null>(null);
  const loadSeqRef = useRef(0);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const eventsChannelRef = useRef<RealtimeChannel | null>(null);
  useEffect(()=>{const a=()=>setOnline(true),b=()=>setOnline(false);window.addEventListener("online",a);window.addEventListener("offline",b);if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});return()=>{window.removeEventListener("online",a);window.removeEventListener("offline",b)}},[]);
  useEffect(()=>{let alive=true;const refresh=()=>{const seq=++loadSeqRef.current;return loadMasariData(selectedChildRef.current).then((next)=>{if(!alive||seq!==loadSeqRef.current)return;setData(next);const sim=simulationFromTrip(next);if(sim)setSimulation(sim)}).catch(()=>{})};refresh();const {data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{if(event==="PASSWORD_RECOVERY"){setRecoveryClosed(false);setRecoveryEvent(true)}void refresh()});return()=>{alive=false;subscription.unsubscribe()}},[]);
  useEffect(()=>{let alive=true;loadDriverRows().then((rows)=>{if(alive)setExtraDrivers(rows)}).catch(()=>{});return()=>{alive=false}},[authMode]);
  useEffect(()=>{let alive=true;loadStudentRows().then((rows)=>{if(alive)setStudentRows(rows)}).catch(()=>{});return()=>{alive=false}},[authMode]);
  useEffect(()=>{let alive=true;loadRouteRows().then((rows)=>{if(alive)setRouteRows(rows)}).catch(()=>{});return()=>{alive=false}},[authMode]);
  useEffect(()=>{let alive=true;supabase.auth.getSession().then(async({data:sessionData})=>{if(!alive||!sessionData.session)return;const access=await resolveUserAccess(sessionData.session);if(!alive)return;if(!access.role){setPendingAccount(access);return}setRole(access.role);setAccountName(access.name);setPlatformAdmin(access.platformAdmin);setAuthMode("authenticated");setFeedbackRows([]);setEntered(true)}).catch(()=>{});return()=>{alive=false}},[]);
  useEffect(()=>()=>{if(gpsWatchRef.current!==null) navigator.geolocation.clearWatch(gpsWatchRef.current); if(realtimeChannelRef.current) void supabase.removeChannel(realtimeChannelRef.current); if(eventsChannelRef.current) void supabase.removeChannel(eventsChannelRef.current)},[]);
  const [dbNotes,setDbNotes]=useState<DbNotification[]>([]);
  useEffect(()=>{
    if(!entered||authMode!=="authenticated")return;
    let alive=true; let channel: RealtimeChannel | null = null; let poll: number | null = null;
    const run=async()=>{
      const {data:sessionData}=await supabase.auth.getSession(); const uid=sessionData.session?.user.id; if(!uid||!alive)return;
      const loadNotes=async()=>{const {data:rows}=await supabase.from("notifications").select("id,type,title,body,created_at,read_at").order("created_at",{ascending:false}).limit(20);if(alive&&rows)setDbNotes(rows)};
      await loadNotes();
      // احتياط إن انقطع الاتصال اللحظي (شبكات الجوال الضعيفة): تحديث كل 30 ثانية.
      poll=window.setInterval(()=>void loadNotes(),30000);
      channel=supabase.channel(`masari-notes-${uid}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:`user_id=eq.${uid}`},(payload)=>{const n=payload.new as DbNotification;setDbNotes((cur)=>[n,...cur.filter((x)=>x.id!==n.id)].slice(0,20))}).subscribe();
    };
    void run();
    return()=>{alive=false;if(poll!==null)window.clearInterval(poll);if(channel)void supabase.removeChannel(channel)};
  },[entered,authMode]);
  const nav=useMemo(()=>navByRole[role],[role]); const notifications=useMemo(()=>authMode==="authenticated" ? dbNotes.map((n)=>({id:n.id,title:n.title,body:n.body??"",time:formatEventTime(n.created_at),tone:noteTone(n.type)})) : data.source==="empty" ? [] : buildNotifications(data, simulation, driverGps, tripEvents, feedbackRows),[authMode, dbNotes, data, simulation, driverGps, tripEvents, feedbackRows]);
  const unreadCount = authMode==="authenticated" ? dbNotes.filter((n)=>!n.read_at).length : notifications.length;
  const toggleNotifications=()=>{const opening=!notificationsOpen;setNotificationsOpen(opening);if(opening&&authMode==="authenticated"&&dbNotes.some((n)=>!n.read_at)){const ids=dbNotes.filter((n)=>!n.read_at).map((n)=>n.id);const now=new Date().toISOString();setDbNotes((cur)=>cur.map((n)=>ids.includes(n.id)?{...n,read_at:now}:n));void supabase.from("notifications").update({read_at:now}).in("id",ids).then(()=>{})}};
  const enterAuthenticated=async(session: Session)=>{const access=await resolveUserAccess(session);if(!access.role){setPendingAccount(access);return}setPendingAccount(null);setRole(access.role);setAccountName(access.name);setPlatformAdmin(access.platformAdmin);setAuthMode("authenticated");setFeedbackRows([]);setView("dashboard");setEntered(true)};
  const stopGpsTracking=()=>{if(gpsWatchRef.current!==null){navigator.geolocation.clearWatch(gpsWatchRef.current);gpsWatchRef.current=null}setGpsStatus("تم إيقاف تتبع GPS.")};
  const stopRealtimeTracking=()=>{if(realtimeChannelRef.current){void supabase.removeChannel(realtimeChannelRef.current);realtimeChannelRef.current=null}};
  const stopEventsRealtime=()=>{if(eventsChannelRef.current){void supabase.removeChannel(eventsChannelRef.current);eventsChannelRef.current=null}};
  const signOut=async()=>{if(authMode==="authenticated") await supabase.auth.signOut();stopGpsTracking();stopRealtimeTracking();stopEventsRealtime();setAuthMode("demo");setAccountName("");setEntered(false);setView("dashboard");setSimulation(initialSimulation);setActiveTripContext(null);setTripSaveStatus("");setDriverGps(null);setTripEvents([]);setFeedbackRows([]);setNotificationsOpen(false)};
  const addDriver=async(driver: DriverForm)=>{
    const optimistic: DriverRow = { ...driver, status: authMode === "authenticated" ? "بانتظار تفعيل الحساب" : "قيد المراجعة", capacity: data.vehicle.capacity, saved: authMode === "authenticated" };
    setExtraDrivers((current)=>[optimistic, ...current]);
    if (authMode !== "authenticated") return;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { data: schoolRows } = await supabase.from("schools").select("id").eq("name", data.school.name).limit(1);
    const schoolId = data.school.id ?? schoolRows?.[0]?.id;
    if (!schoolId) return;
    const { error } = await supabase.from("driver_onboarding_requests").insert({
      school_id: schoolId,
      created_by: userId,
      driver_name: driver.name,
      phone: driver.phone,
      email: driver.email || null,
      vehicle_plate: driver.plate,
      vehicle_capacity: data.vehicle.capacity > 0 ? data.vehicle.capacity : null,
      status: "pending",
    });
    const rows = await loadDriverRows().catch(()=>null);
    if (rows) setExtraDrivers(rows);
    if (error) throw error;
  };
  const addStudent=async(student: StudentForm)=>{
    const optimistic: StudentRow = { ...student, status: authMode === "authenticated" ? "بانتظار حساب ولي الأمر" : "قيد المراجعة", saved: authMode === "authenticated" };
    setStudentRows((current)=>[optimistic, ...current]);
    if (authMode !== "authenticated") return;
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { data: schoolRows } = await supabase.from("schools").select("id").eq("name", data.school.name).limit(1);
    const schoolId = data.school.id ?? schoolRows?.[0]?.id;
    if (!schoolId) return;
    const { error } = await supabase.from("student_onboarding_requests").insert({
      school_id: schoolId,
      created_by: userId,
      student_name: student.name,
      grade: student.grade,
      parent_name: student.parentName || null,
      parent_phone: student.parentPhone,
      parent_email: student.parentEmail || null,
      home_address: student.address,
      home_latitude: null,
      home_longitude: null,
      status: "pending_parent_account",
    });
    const rows = await loadStudentRows().catch(()=>null);
    if (rows) setStudentRows(rows);
    if (error) throw error;
  };
  const addRoute=async(route: RouteForm)=>{
    const stops = route.stopsText.split("\n").map((line)=>line.trim()).filter(Boolean);
    const optimistic: RouteRow = { name: route.name, direction: route.direction === "to_home" ? "إلى المنزل" : "إلى المدرسة", scheduledTime: route.scheduledTime, stops: stops.join(" ← "), status: authMode === "authenticated" ? "نشط" : "قيد الإعداد", saved: authMode === "authenticated" };
    setRouteRows((current)=>[optimistic, ...current]);
    if (authMode !== "authenticated") return;
    const { data: schoolRows } = await supabase.from("schools").select("id").eq("name", data.school.name).limit(1);
    const schoolId = data.school.id ?? schoolRows?.[0]?.id;
    if (!schoolId) return;
    const { data: routeInsert, error } = await supabase.from("routes").insert({
      school_id: schoolId,
      name: route.name,
      direction: route.direction,
      scheduled_time: route.scheduledTime,
      estimated_duration_minutes: Math.max(stops.length * 12, 20),
      is_active: true,
    }).select("id").single();
    if (error || !routeInsert?.id) return;
    try {
      await supabase.from("route_stops").insert(stops.map((label, index)=>({
        route_id: routeInsert.id,
        stop_type: route.direction === "to_home" ? "dropoff" : "pickup",
        stop_order: index + 1,
        label,
        scheduled_time: route.scheduledTime,
      }))).throwOnError();
    } catch {}
    const rows = await loadRouteRows().catch(()=>null);
    if (rows) setRouteRows(rows);
  };
  const submitFeedback=async(feedback: Omit<FeedbackItem, "id" | "createdAt" | "saved">)=>{
    const localId = `feedback-${Date.now()}`;
    const nextFeedback: FeedbackItem = { ...feedback, id: localId, createdAt: new Date().toISOString(), saved: authMode === "authenticated" };
    setFeedbackRows((current)=>[nextFeedback, ...current].slice(0, 12));
    setNotificationsOpen(true);
    if (authMode !== "authenticated") return;
    try {
      const { data: schoolRows } = await supabase.from("schools").select("id").eq("name", data.school.name).limit(1);
      const schoolId = data.school.id ?? schoolRows?.[0]?.id ?? null;
      const { data: studentRowsData } = await supabase.from("students").select("id").eq("full_name", data.student.name).limit(1);
      await supabase.from("ratings_feedback").insert({
        school_id: schoolId,
        student_id: studentRowsData?.[0]?.id ?? null,
        author_name: feedback.author,
        author_role: feedback.role,
        rating: feedback.rating,
        category: feedback.category,
        message: feedback.message,
        status: "new",
      }).throwOnError();
      setFeedbackRows((current)=>current.map((item)=>item.id === localId ? { ...item, saved: true, status: "تم الإرسال" } : item));
    } catch {
      setFeedbackRows((current)=>current.map((item)=>item.id === localId ? { ...item, saved: false, status: "محفوظ محلياً" } : item));
    }
  };
  const saveLocation=async(kind: "school" | "home", point: LocationPoint)=>{
    setData((current)=>{
      if (kind === "school") return { ...current, school: { ...current.school, location: point } };
      return { ...current, student: { ...current.student, address: point.address, location: point }, route: { ...current.route, stops: current.route.stops.map((stop)=>stop.studentName === current.student.name || stop.label.includes("النسيم") ? { ...stop, label: point.address.includes("النسيم") ? "النسيم - شارع عبدالله بن عمر" : stop.label, lat: point.lat, lng: point.lng } : stop) } };
    });
    setSaveStatus("تم تحديث الموقع على الشاشة.");
    try {
      const targetId = kind === "school" ? data.school.id : data.student.id;
      if (authMode !== "authenticated" || !targetId) throw new Error("NOT_SAVED");
      const { error } = kind === "school"
        ? await supabase.from("schools").update({ address: point.address, latitude: point.lat, longitude: point.lng }).eq("id", targetId)
        : await supabase.from("students").update({ home_address: point.address, home_label: point.label, home_latitude: point.lat, home_longitude: point.lng }).eq("id", targetId);
      if (error) throw error;
      if (kind === "school") setData((current)=>({ ...current, school: { ...current.school, located: true } }));
      setSaveStatus("تم حفظ الموقع وتحديث الخريطة.");
      void reloadData().catch(()=>{});
    } catch {
      setSaveStatus("تم تحديث الموقع على الشاشة، وسيحتاج الحفظ النهائي لتسجيل دخول فعلي.");
    }
    setTimeout(()=>setSaveStatus(""), 3800);
  };
  const showTripSaveStatus=(message: string)=>{setTripSaveStatus(message);if(statusTimerRef.current!==null)window.clearTimeout(statusTimerRef.current);statusTimerRef.current=window.setTimeout(()=>setTripSaveStatus(""), 5200)};
  const setSavedGpsPoint=(row: { latitude: number | string; longitude: number | string; created_at?: string | null })=>{
    const nextPoint: DriverGps = {
      label: "آخر موقع محفوظ للسائق",
      address: "Supabase Realtime",
      lat: toNumber(row.latitude, data.route.stops[0]?.lat ?? data.student.location.lat),
      lng: toNumber(row.longitude, data.route.stops[0]?.lng ?? data.student.location.lng),
      accuracy: null,
      updatedAt: row.created_at ?? new Date().toISOString(),
    };
    setDriverGps(nextPoint);
    setGpsStatus("تم تحديث موقع الباص من قاعدة البيانات.");
  };
  const subscribeToTripLocations=(tripId: string)=>{
    if (realtimeChannelRef.current) void supabase.removeChannel(realtimeChannelRef.current);
    realtimeChannelRef.current = supabase
      .channel(`masari-vehicle-location-${tripId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vehicle_locations", filter: `trip_id=eq.${tripId}` }, (payload) => {
        const row = payload.new as { latitude?: number | string; longitude?: number | string; recorded_at?: string | null };
        if (row.latitude != null && row.longitude != null) setSavedGpsPoint({ latitude: row.latitude, longitude: row.longitude, created_at: row.recorded_at });
      })
      .subscribe();
  };
  const normalizeTripEvent=(row: { id?: string; event_type?: string | null; note?: string | null; created_at?: string | null }): TripEventRow => ({
    id: row.id,
    eventType: row.event_type ?? "note",
    note: row.note ?? "تحديث رحلة",
    createdAt: row.created_at ?? new Date().toISOString(),
  });
  const subscribeToTripEvents=(tripId: string)=>{
    if (eventsChannelRef.current) void supabase.removeChannel(eventsChannelRef.current);
    eventsChannelRef.current = supabase
      .channel(`masari-trip-events-${tripId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trip_events", filter: `trip_id=eq.${tripId}` }, (payload) => {
        const nextEvent = normalizeTripEvent(payload.new as { id?: string; event_type?: string | null; note?: string | null; created_at?: string | null });
        setTripEvents((current)=>[nextEvent, ...current.filter((event)=>event.id !== nextEvent.id)].slice(0, 10));
        if (nextEvent.eventType === "pickup") setSimulation((current)=>({ ...current, studentStatus: "on_bus" }));
        if (nextEvent.eventType === "dropoff") setSimulation((current)=>({ ...current, studentStatus: "arrived" }));
      })
      .subscribe();
  };
  const loadTripEvents=async(tripId: string)=>{
    const { data: events } = await supabase
      .from("trip_events")
      .select("id,event_type,note,created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (events?.length) {
      const normalized = events.map((event)=>normalizeTripEvent(event));
      setTripEvents(normalized);
      const latest = normalized[0];
      if (latest.eventType === "pickup") setSimulation((current)=>({ ...current, studentStatus: "on_bus" }));
      if (latest.eventType === "dropoff") setSimulation((current)=>({ ...current, studentStatus: "arrived" }));
    }
  };
  const reloadData=async()=>{const seq=++loadSeqRef.current;const next=await loadMasariData(selectedChildRef.current);if(seq!==loadSeqRef.current)return next;setData(next);const sim=simulationFromTrip(next);if(sim)setSimulation(sim);return next};
  const liveTripId = authMode==="authenticated" && data.trip && ACTIVE_TRIP_STATUSES.includes(data.trip.status) ? data.trip.id : null;
  const loadLatestSavedGps=async()=>{
    const tripId = data.trip?.id;
    if (authMode !== "authenticated" || !tripId) return;
    // السائق يرى موقعه من جهازه مباشرة؛ غيره يتابع آخر موقع محفوظ.
    if (role !== "driver") {
      subscribeToTripLocations(tripId);
      const { data: locations } = await supabase.from("vehicle_locations").select("latitude,longitude,recorded_at").eq("trip_id", tripId).order("recorded_at", { ascending: false }).limit(1);
      if (locations?.[0]) setSavedGpsPoint({ latitude: locations[0].latitude, longitude: locations[0].longitude, created_at: locations[0].recorded_at });
    }
    subscribeToTripEvents(tripId);
    await loadTripEvents(tripId);
  };
  useEffect(()=>{
    if (!entered || authMode !== "authenticated" || !data.trip?.id) return;
    let alive = true;
    const refresh = async()=>{if(alive) await loadLatestSavedGps().catch(()=>{})};
    void refresh();
    const interval = window.setInterval(()=>{ if (alive) void reloadData().catch(()=>{}); }, 15000);
    return ()=>{alive=false;window.clearInterval(interval);stopRealtimeTracking();stopEventsRealtime()};
    // The trip id is the subscription identity; helper functions intentionally read the latest component state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered, authMode, data.trip?.id]);
  const persistGpsLocation=async(point: DriverGps, context?: TripContext | null)=>{
    const tripId = context?.tripId ?? activeTripContext?.tripId ?? (role === "driver" ? liveTripId : null);
    if (!tripId || Date.now() - lastGpsSaveRef.current < 10000) return;
    lastGpsSaveRef.current = Date.now();
    const { error } = await supabase.from("vehicle_locations").insert({ trip_id: tripId, latitude: point.lat, longitude: point.lng, accuracy: point.accuracy ?? null });
    setGpsStatus(error ? "GPS يعمل على الشاشة، لكن تعذر حفظ الموقع." : "تم حفظ موقع الباص.");
  };
  const handleGpsPosition=(position: GeolocationPosition, context?: TripContext | null)=>{
    const nextPoint: DriverGps = {
      label: "موقع السائق الحالي",
      address: "GPS مباشر من جهاز السائق",
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      updatedAt: new Date().toISOString(),
    };
    setDriverGps(nextPoint);
    setGpsStatus(`آخر تحديث GPS بدقة ${Math.round(position.coords.accuracy)} متر.`);
    void persistGpsLocation(nextPoint, context);
  };
  const startGpsTracking=(context?: TripContext | null)=>{
    if (!("geolocation" in navigator)) {
      setGpsStatus("هذا الجهاز لا يدعم تحديد الموقع من المتصفح.");
      return;
    }
    setGpsStatus("نطلب إذن الموقع من الجهاز…");
    if (gpsWatchRef.current !== null) navigator.geolocation.clearWatch(gpsWatchRef.current);
    navigator.geolocation.getCurrentPosition(
      (position)=>handleGpsPosition(position, context),
      ()=>setGpsStatus("لم يتم السماح بالموقع. استخدم إعدادات المتصفح لتفعيل GPS."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
    );
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (position)=>handleGpsPosition(position, context),
      ()=>setGpsStatus("تعذر تحديث GPS الآن. تحقق من إذن الموقع والإنترنت."),
      { enableHighAccuracy: true, timeout: 18000, maximumAge: 15000 },
    );
  };
  const refreshGpsNow=()=>{
    if (!("geolocation" in navigator)) {
      setGpsStatus("هذا الجهاز لا يدعم تحديد الموقع من المتصفح.");
      return;
    }
    setGpsStatus("جارٍ تحديث موقع GPS…");
    navigator.geolocation.getCurrentPosition(
      (position)=>handleGpsPosition(position, activeTripContext),
      ()=>setGpsStatus("تعذر قراءة الموقع. اسمح للموقع باستخدام GPS من المتصفح."),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };
  const startTrip=()=>{
    if (authMode !== "authenticated") {
      setSimulation({ active: true, currentStopIndex: 0, approvedStops: [], studentStatus: "approaching" });
      startGpsTracking(null);
      return;
    }
    const tripId = data.trip?.id;
    if (!tripId) { showTripSaveStatus("لا توجد رحلة مسندة إليك اليوم."); return; }
    void (async()=>{
      const { error } = await supabase.rpc("start_trip", { p_trip: tripId });
      if (error) { showTripSaveStatus(rpcError(error)); return; }
      const context = { tripId };
      setActiveTripContext(context);
      await reloadData();
      showTripSaveStatus("بدأت الرحلة وتم إشعار أولياء الأمور.");
      startGpsTracking(context);
    })();
  };
  const endTrip=()=>{
    if (authMode !== "authenticated") {
      setSimulation((current)=>({ ...current, active: false }));
      stopGpsTracking();
      return;
    }
    const tripId = data.trip?.id;
    if (!tripId) return;
    if (!window.confirm("هل تأكدت أن الباص خالٍ من الطلاب؟")) return;
    void (async()=>{
      const { error } = await supabase.rpc("complete_trip", { p_trip: tripId, p_bus_checked: true });
      if (error) { showTripSaveStatus(rpcError(error)); return; }
      stopGpsTracking();
      setActiveTripContext(null);
      await reloadData();
      showTripSaveStatus("انتهت الرحلة وحُفظت.");
    })();
  };
  const selectChild=(childId: string)=>{selectedChildRef.current=childId;setTripEvents([]);setDriverGps(null);void reloadData().catch(()=>{})};
  const setAbsence=async(absent: boolean)=>{
    if (!data.trip || !data.student.id) return;
    const { error } = await supabase.rpc("guardian_set_absence", { p_trip: data.trip.id, p_student: data.student.id, p_absent: absent });
    if (error) { showTripSaveStatus(rpcError(error)); return; }
    await reloadData();
    showTripSaveStatus(absent ? `تم تسجيل غياب ${data.student.name} اليوم، ولن ينتظره السائق.` : `تم إلغاء غياب ${data.student.name}.`);
  };
  const recordStudent=(studentId: string, event: AttendanceEvent)=>{void (async()=>{
    if (!data.trip) return;
    const { error } = await supabase.rpc("record_attendance", {
      p_trip: data.trip.id, p_student: studentId, p_event: event,
      p_method: "manual", p_lat: driverGps?.lat ?? null, p_lng: driverGps?.lng ?? null,
    });
    if (error) { showTripSaveStatus(rpcError(error)); return; }
    await reloadData();
    showTripSaveStatus(attendanceDoneText[event]);
  })()};
  const approveStop=()=>setSimulation((current)=>{
    const stopCount = data.route.stops.length;
    const approvedStops = Array.from(new Set([...current.approvedStops, current.currentStopIndex])).sort((a,b)=>a-b);
    const nextIndex = Math.min(current.currentStopIndex + 1, stopCount - 1);
    const done = approvedStops.length >= stopCount;
    return {
      active: !done,
      currentStopIndex: nextIndex,
      approvedStops,
      studentStatus: done ? "arrived" : current.currentStopIndex >= stopCount - 2 ? "on_bus" : "approaching",
    };
  });
  const approveStopAndRecord=()=>{void (async()=>{
    const index=simulation.currentStopIndex;
    const stop=data.route.stops[index];
    if(!simulation.active||!stop)return;
    if(!driverGps){showTripSaveStatus("لا يمكن اعتماد المحطة دون موقع GPS فعلي.");return}
    const distance=Math.round(distanceMeters(driverGps,stop));
    if(authMode==="authenticated"){
      // الخادم يتحقق من الترتيب والنطاق ودقة GPS؛ الواجهة تعرض النتيجة فقط.
      if(!data.trip||!stop.id){showTripSaveStatus("ابدأ الرحلة أولاً.");return}
      const { data: result, error } = await supabase.rpc("arrive_at_stop", { p_trip: data.trip.id, p_stop: stop.id, p_lat: driverGps.lat, p_lng: driverGps.lng, p_accuracy: driverGps.accuracy ?? null });
      if(error){showTripSaveStatus(rpcError(error));return}
      await reloadData();
      showTripSaveStatus(`تم اعتماد ${stop.label} من مسافة ${(result as { distance?: number } | null)?.distance ?? distance} متر.`);
      return;
    }
    const allowedDistance=STOP_RADIUS_METERS+Math.min(driverGps.accuracy??0,100);
    if(distance>allowedDistance){showTripSaveStatus(`أنت تبعد ${distance} متر عن ${stop.label}. اقترب حتى 250 متر.`);return}
    showTripSaveStatus(`تم اعتماد ${stop.label} عبر GPS من مسافة ${distance} متر. الحفظ الدائم يحتاج تسجيل دخول فعلي.`);
    approveStop();
  })()};
  const reportIssue=()=>{
    if (!simulation.active) {
      showTripSaveStatus("ابدأ الرحلة أولاً قبل إرسال البلاغ.");
      return;
    }
    const stop = data.route.stops[simulation.currentStopIndex] ?? data.route.stops[0];
    const point = driverGps ?? (stop ? { label: stop.label, address: stop.label, lat: stop.lat, lng: stop.lng } : data.student.location);
    const localId = `local-emergency-${Date.now()}`;
    const note = `بلاغ طارئ من السائق عند ${stop?.label ?? point.label}: يحتاج متابعة من برج المراقبة`;
    const optimisticEvent: TripEventRow = { id: localId, eventType: "emergency", note, createdAt: new Date().toISOString() };
    setTripEvents((current)=>[optimisticEvent, ...current].slice(0, 10));
    setNotificationsOpen(true);
    showTripSaveStatus("تم إرسال البلاغ لبرج المراقبة.");
    void (async()=>{
      if (authMode !== "authenticated") return;
      if (!data.trip) return;
      const { error } = await supabase.rpc("report_emergency", { p_trip: data.trip.id, p_type: "emergency", p_description: note, p_lat: point.lat, p_lng: point.lng });
      if (error) { showTripSaveStatus(rpcError(error)); return; }
      await loadTripEvents(data.trip.id);
      showTripSaveStatus("تم حفظ البلاغ الطارئ وإشعار برج المراقبة.");
    })();
  };
  const leavePending=async()=>{await supabase.auth.signOut({ scope: "local" });setPendingAccount(null)};
  const recheckPending=async()=>{const {data:sessionData}=await supabase.auth.getSession();if(!sessionData.session)return;await enterAuthenticated(sessionData.session);await reloadData().catch(()=>{})};
  const finishRecovery=async()=>{setRecoveryClosed(true);setRecoveryEvent(false);const {data:sessionData}=await supabase.auth.getSession();if(sessionData.session)await enterAuthenticated(sessionData.session)};
  const cancelRecovery=async()=>{await supabase.auth.signOut({ scope: "local" });if(typeof window!=="undefined")window.history.replaceState(null,"",window.location.pathname);setRecoveryClosed(true);setRecoveryEvent(false)};
  if(recovering) return <ResetPasswordPage onDone={()=>void finishRecovery()} onCancel={()=>void cancelRecovery()}/>;
  if(pendingAccount) return <PendingAccount email={pendingAccount.email} requestedRole={pendingAccount.requestedRole} suspended={pendingAccount.suspended} onSignOut={()=>void leavePending()} onRecheck={recheckPending}/>;
  if(!entered && authView==="landing") return <Landing onLogin={()=>setAuthView("login")} onRegisterSchool={()=>setAuthView("school")}/>;
  if(!entered) return <AuthPage key={authView} onAuthenticated={enterAuthenticated} initialMode={authView==="school"?"signup":"login"} initialRole={authView==="school"?"school":"parent"} onBack={()=>setAuthView("landing")}/>;
  return <div dir="rtl" className="masari-app">{!online&&<div className="offline-banner">أنت تعمل دون اتصال — نعرض آخر بيانات محفوظة</div>}<SidebarProvider style={{"--sidebar-width":"17.5rem"} as React.CSSProperties}>
    <Sidebar side="right" variant="sidebar" collapsible="offcanvas" className="masari-sidebar"><SidebarHeader className="sidebar-brand"><div className="brand-mark"><BusFront/></div><div><strong>مساري</strong><span>إدارة النقل المدرسي</span></div></SidebarHeader><SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>{nav.map(item=><SidebarMenuItem key={item.id}><SidebarMenuButton isActive={view===item.id} onClick={()=>setView(item.id)} tooltip={item.label}><item.icon/><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent><SidebarFooter className="sidebar-footer"><div className="support-card"><MessageSquareText/><strong>تحتاج مساعدة؟</strong><p>{data.source==="empty" || (data.school.contactName==="—" && data.school.phone==="—") ? "تواصل مع إدارة مساري" : [data.school.contactName, data.school.phone].filter((v)=>v!=="—").join(" · ")}</p><button>تواصل معنا</button></div><div className="account-row"><span>{(accountName || data.school.contactName).charAt(0)}</span><div><strong>{accountName || (role==="parent"?data.parent.name:role==="driver"?data.driver.name:data.school.contactName)}</strong><p>{roleNames[role]}</p></div><button onClick={()=>authMode==="authenticated"?void signOut():setLogin(true)}>{authMode==="authenticated"?"خروج":"دخول"}</button></div></SidebarFooter></Sidebar>
    <SidebarInset className="app-inset"><header className="topbar"><div className="mobile-logo"><SidebarTrigger><Menu/></SidebarTrigger><div className="brand-mark"><BusFront/></div><strong>مساري</strong></div><div className="top-actions"><Badge variant="outline">{authMode==="authenticated"?"جلسة فعلية":simulation.active?driverGps?"GPS مباشر":"GPS غير متاح":data.source==="supabase"?"متصل بقاعدة البيانات":"بيانات محفوظة"}</Badge><Badge variant="outline" className="role-badge">{roleNames[role]}</Badge><button className="text-link top-exit" onClick={()=>void signOut()}>خروج</button><div className="notification-wrap"><button className="icon-button" aria-label="الإشعارات" onClick={toggleNotifications}><Bell/>{unreadCount>0&&<span>{unreadCount}</span>}</button>{notificationsOpen&&<div className="notification-popover"><div className="notification-head"><strong>الإشعارات</strong><small>{notifications.length} تحديثات</small></div>{authMode==="authenticated"&&<PushToggle compact/>}{notifications.length===0&&<p className="muted-label notification-empty">لا توجد إشعارات بعد.</p>}{notifications.map((notification)=><div className="notification-item" key={notification.id}><span className={`notify-dot ${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.body}</p></div><small>{notification.time}</small></div>)}</div>}</div></div></header><main className="content">{authMode==="authenticated" && view==="schools" ? <AdminSchools canManage={platformAdmin}/> : authMode==="authenticated" && view==="control" && (role==="school"||role==="executive") ? <LiveControl canHandleEmergencies={role==="school"||platformAdmin}/> : view==="operations" ? (authMode==="authenticated" && data.school.id ? <SchoolOps schoolId={data.school.id}/> : <article className="panel empty-state"><h2>التشغيل اليومي</h2><p>هذه الصفحة تعمل بالحساب الفعلي لإدارة المدرسة فقط.</p></article>) : data.source==="empty" && (view==="dashboard"||view==="control"||view==="locations") ? <EmptyState role={role}/> : view==="dashboard" ? role==="driver" ? <DriverDashboard data={data} simulation={simulation} tripSaveStatus={tripSaveStatus} driverGps={driverGps} gpsStatus={gpsStatus} onStart={startTrip} onEnd={endTrip} onApproveStop={approveStopAndRecord} onRefreshGps={refreshGpsNow} onReportIssue={reportIssue} onStudentEvent={recordStudent}/> : role==="parent" ? <ParentDashboard data={data} simulation={simulation} driverGps={driverGps} tripEvents={tripEvents} feedbackRows={feedbackRows} authMode={authMode} tripSaveStatus={tripSaveStatus} onSubmitFeedback={submitFeedback} onSelectChild={selectChild} onSetAbsence={setAbsence}/> : <ExecutiveDashboard data={data} simulation={simulation} driverGps={driverGps}/> : view==="control" ? <ControlTower data={data} simulation={simulation} driverGps={driverGps} tripEvents={tripEvents}/> : view==="locations" ? <LocationsView data={data} role={role} simulation={simulation} saveStatus={saveStatus} onSaveLocation={saveLocation}/> : <DataView data={data} view={view} role={role} simulation={simulation} extraDrivers={extraDrivers} studentRows={studentRows} routeRows={routeRows} tripEvents={tripEvents} feedbackRows={feedbackRows} onAddDriver={addDriver} onAddStudent={addStudent} onAddRoute={addRoute} authMode={authMode}/>}</main><nav className="mobile-nav">{nav.slice(0,4).map(item=><button className={view===item.id?"active":""} onClick={()=>setView(item.id)} key={item.id}><item.icon/><span>{item.label}</span></button>)}</nav></SidebarInset>
  </SidebarProvider>{login&&<LoginDialog onClose={()=>setLogin(false)} onAuthenticated={enterAuthenticated}/>}</div>;
}
