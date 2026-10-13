"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Activity, AlertTriangle, Bell, BusFront, CalendarDays,
  Check, ChevronLeft, CircleDollarSign, Clock3, FileClock, GraduationCap,
  LayoutDashboard, MapPin, Menu, BarChart3, MessageCircle, Receipt, MessageSquareText, Navigation, RadioTower, Bug, Route, ScanLine, School, WalletCards, ShieldCheck, Users, X, ClipboardList, Database,
} from "lucide-react";
import { SchoolOps, type OpsTab } from "./school-ops";
import { QrScanner } from "./student-card";
import { installErrorReporter } from "@/lib/error-reporter";
import { isNativeApp, locateOnce, watchLocation, type Fix } from "@/lib/location";
import { ConsentGate, PRIVACY_URL, PRIVACY_VERSION, PrivacyPolicy } from "./privacy";
import { TripMap, navigateUrl, fullRouteUrl } from "./trip-map";
import { ParentHomeLocations } from "./home-location";
import { ParentGate, SchoolGate } from "./gate";
import { VehicleCheck } from "./safety";
import { SchoolTeam } from "./team";
import { RegionReport, SchoolReport } from "./reports";
import { ParentFees, SchoolFees } from "./fees";
import { ParentChat, SchoolChat } from "./chat";
import { MessageChannels, MessageStats } from "./channels";
import { PendingAccount, SIGNUP_ROLES, type SignupRole } from "./onboarding";
import { AdminDirectory } from "./school-directory";
import { FeedbackList, ParentChildren, TripHistory } from "./role-pages";
import { AdminBilling, SchoolBilling } from "./billing";
import { AuditLog, DataManager, ErrorLog, RegionOverview, UsersAdmin } from "./platform-admin";
import { LiveControl } from "./live-control";
import { ForgotPassword, ResetPasswordPage, isRecoveryLink, PushToggle } from "./account";
import { Landing } from "./landing";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/lib/supabase";
import { MapPicker } from "./school-form";
import { AccountPage, LangToggle } from "./delete-account";
import { DeleteAccountRequest } from "./delete-request";
import { LocationDisclosure, hasLocationDisclosure } from "./location-disclosure";
import { forgetNativePushToken, refreshNativePush } from "@/lib/native-push";
import { applyLang } from "./i18n";
import { ShareLinks, SharedTripPage, shareTokenFromHash } from "./share";
import { dismissFailed, enqueue, isNetworkError, useOfflineQueue, type FailedItem } from "./offline-queue";
import { OfflineError, cacheAccess, cacheDriverData, cachedAccess, cachedDriverData, clearOfflineCache } from "./offline-cache";
import { AttendancePanel, DelayMap, StudentAvatar, usePhotoUrls } from "./school-extras";
import { UserRound } from "lucide-react";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";

type Role = "executive" | "school" | "driver" | "parent";
type AuthMode = "demo" | "authenticated";
type View = "account" | "fees" | "chat" | "team" | "gate" | "pickup" | "errors" | "billing" | "requests" | "children" | "history" | "feedback" | "dashboard" | "control" | "locations" | "schools" | "students" | "fleet" | "routes" | "trips" | "finance" | "reports" | "audit" | "users" | "data";
type LocationPoint = { label: string; address: string; lat: number; lng: number };
type MasariData = {
  source: "cached" | "supabase" | "empty";
  school: { id?: string; located?: boolean; name: string; city: string; contactName: string; phone: string; location: LocationPoint };
  vehicle: { number: string; plate: string; capacity: number };
  driver: { name: string; email: string };
  route: { name: string; scheduledTime: string; estimatedMinutes: number; stops: { id?: string; status?: string; radius?: number; label: string; time: string; lat: number; lng: number; studentName?: string | null; students?: string[] }[] };
  student: { id?: string; name: string; grade: string; address: string; status: string; location: LocationPoint };
  parent: { name: string; email: string; phone: string };
  ride: { date: string; status: string; studentStatus: string };
  counts?: { students: number; buses: number; routes: number; subscriptions: number };
  // الرحلة الفعلية اليوم وطلابها (للحساب الفعلي فقط).
  trip?: { id: string; status: string; date: string; direction: string } | null;
  students?: { id: string; name: string; grade: string; status: string; photo?: string | null }[];
};
type SimulationState = {
  active: boolean;
  currentStopIndex: number;
  approvedStops: number[];
  studentStatus: "waiting" | "approaching" | "on_bus" | "arrived";
};
type TripContext = { tripId: string };
type DriverGps = LocationPoint & { accuracy?: number | null; speed?: number | null; updatedAt?: string };
type TripEventRow = { id?: string; eventType: string; note: string; createdAt: string; studentName?: string | null };
type FeedbackItem = { id: string; author: string; role: "parent" | "school" | "driver" | "executive"; rating: number; category: string; message: string; status: string; createdAt: string; saved?: boolean };
type NotificationItem = { id: string; title: string; body: string; time: string; tone: "green" | "blue" | "amber" | "red" };

const roleNames: Record<Role, string> = {
  executive: "الإدارة التنفيذية", school: "إدارة المدرسة", driver: "السائق", parent: "ولي الأمر",
};
const navByRole: Record<Role, { id: View; label: string; icon: typeof LayoutDashboard }[]> = {
  // الإدارة التنفيذية = إدارة المنطقة: مدارس منطقتها والمراقبة فقط (تشغيل المدارس للمدرسة نفسها).
  executive: [
    { id: "dashboard", label: "نظرة على المنطقة", icon: LayoutDashboard }, { id: "schools", label: "دليل المدارس", icon: School },
    { id: "control", label: "برج المراقبة", icon: RadioTower }, { id: "reports", label: "التقارير", icon: BarChart3 },
  ],
  school: [
    { id: "dashboard", label: "نظرة عامة", icon: LayoutDashboard }, { id: "gate", label: "نداء البوابة", icon: Bell },
    { id: "requests", label: "الطلبات", icon: ClipboardList }, { id: "students", label: "الطلاب", icon: GraduationCap }, { id: "fleet", label: "الباصات والسائقون", icon: BusFront },
    { id: "routes", label: "المسارات", icon: Route }, { id: "trips", label: "رحلات اليوم", icon: Navigation },
    { id: "control", label: "برج المراقبة", icon: RadioTower }, { id: "reports", label: "التقارير", icon: BarChart3 }, { id: "locations", label: "موقع المدرسة", icon: MapPin },
    { id: "chat", label: "المحادثات", icon: MessageCircle }, { id: "fees", label: "رسوم النقل", icon: Receipt },
    { id: "feedback", label: "ملاحظات أولياء الأمور", icon: MessageSquareText }, { id: "billing", label: "اشتراك مساري", icon: WalletCards },
  ],
  driver: [{ id: "dashboard", label: "رحلة اليوم", icon: Navigation }, { id: "history", label: "سجل الرحلات", icon: CalendarDays }],
  parent: [
    { id: "dashboard", label: "متابعة الرحلة", icon: MapPin }, { id: "pickup", label: "النداء والتصاريح", icon: Bell }, { id: "children", label: "أبنائي", icon: GraduationCap },
    { id: "chat", label: "المحادثة", icon: MessageCircle }, { id: "fees", label: "الفواتير", icon: Receipt },
    { id: "history", label: "سجل الرحلات", icon: CalendarDays }, { id: "locations", label: "موقع المنزل", icon: Navigation },
  ],
};
// مدير النظام (المطوّر): ما للإدارة التنفيذية لكل المناطق، مع المستخدمين وإدارة البيانات وسجل التدقيق.
const platformNav: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "نظرة عامة", icon: LayoutDashboard }, { id: "schools", label: "دليل المدارس", icon: School },
  { id: "control", label: "برج المراقبة", icon: RadioTower }, { id: "reports", label: "التقارير", icon: BarChart3 }, { id: "users", label: "المستخدمون والصلاحيات", icon: Users },
  { id: "billing", label: "الاشتراكات والفواتير", icon: WalletCards }, { id: "data", label: "إدارة البيانات", icon: Database }, { id: "audit", label: "سجل التدقيق", icon: FileClock }, { id: "errors", label: "الأعطال", icon: Bug },
];
// صفحات المدرسة حسب دور الموظف: المدير يرى كل شيء، والمشرف بلا الاشتراك والفريق، وموظف البوابة شاشة النداء فقط.
const schoolNavFor = (r: string) => {
  const all = [...navByRole.school, { id: "team" as View, label: "فريق المدرسة", icon: Users }];
  if (r === "school_admin") return all;
  if (r === "gate") return all.filter((i) => i.id === "gate");
  if (r === "control_tower") return all.filter((i) => ["dashboard", "control", "gate"].includes(i.id));
  return all.filter((i) => !["billing", "team", "fees"].includes(i.id));
};
const OPS_VIEWS: View[] = ["requests", "students", "fleet", "routes", "trips"];
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
  VEHICLE_CHECK_REQUIRED: "سجّل فحص الباص أولًا ثم ابدأ الرحلة.",
  FORBIDDEN: "ليست لديك صلاحية لهذا الإجراء.",
  STOP_NOT_REACHED: "اعتمد الوصول إلى محطة الطالب أولًا.",
  INVALID_TRANSITION: "لا يمكن تسجيل هذه الحالة للطالب الآن.",
  STUDENT_NOT_IN_TRIP: "الطالب غير مسجل في هذه الرحلة.",
  TRIP_ALREADY_STARTED: "بدأت الرحلة، ولا يمكن تغيير الغياب الآن. تواصل مع المدرسة.",
  REASON_REQUIRED: "اكتب سبب تخطي المحطة.",
  CANNOT_SKIP_SCHOOL: "لا يمكن تخطي محطة المدرسة.",
  STOP_NOT_IN_TRIP: "المحطة ليست ضمن هذه الرحلة.",
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
type StopRow = { id?: string; status?: string; label: string | null; scheduled_time: string | null; latitude: unknown; longitude: unknown; radius_m?: number | null };
const toStops = (rows: StopRow[] | null, fallback: LocationPoint) => (rows ?? []).map((stop) => ({
  id: stop.id, status: stop.status, radius: stop.radius_m ?? undefined,
  label: stop.label ?? "نقطة توقف", time: formatTime(stop.scheduled_time),
  lat: toNumber(stop.latitude, fallback.lat), lng: toNumber(stop.longitude, fallback.lng), studentName: null,
}));
async function applyRouteAndTrip(next: MasariData, routeId: string, trip: { id: string; status: string; trip_date: string; direction: string; bus_id: string | null; driver_id: string | null } | null) {
  const [{ data: routes }, { data: tripStops }, { data: routeStops }] = await Promise.all([
    supabase.from("routes").select("name,scheduled_time,estimated_duration_minutes,bus_id").eq("id", routeId).limit(1),
    trip ? supabase.from("trip_stops").select("id,status,label,scheduled_time,latitude,longitude,radius_m").eq("trip_id", trip.id).order("stop_order") : Promise.resolve({ data: null }),
    supabase.from("route_stops").select("label,scheduled_time,latitude,longitude,radius_m").eq("route_id", routeId).order("stop_order"),
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
type StudentJoin = { id: string; full_name: string; grade: string | null; photo_path?: string | null } | { id: string; full_name: string; grade: string | null; photo_path?: string | null }[] | null;
const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;

// السائق: رحلته المسندة إليه اليوم فقط.
async function loadDriverData(userId: string): Promise<MasariData | null> {
  const { data: drivers, error: driversError } = await supabase.from("drivers").select("id,school_id,full_name,email").eq("user_id", userId).limit(1);
  if (driversError && isNetworkError(driversError)) throw new OfflineError();
  const driver = drivers?.[0];
  if (!driver) return null;
  const { data: schools } = await supabase.from("schools").select(SCHOOL_COLUMNS).eq("id", driver.school_id).limit(1);
  if (!schools?.[0]) return null;
  const next = blankDataFor(schools[0]);
  next.driver = { name: driver.full_name, email: driver.email ?? "" };
  const { data: trips, error: tripsError } = await supabase.from("trips").select("id,route_id,bus_id,driver_id,trip_date,status,direction,scheduled_start,completed_at")
    .eq("driver_id", driver.id).eq("trip_date", riyadhToday()).neq("status", "cancelled").order("scheduled_start", { ascending: true, nullsFirst: true });
  if (tripsError && isNetworkError(tripsError)) throw new OfflineError();
  const trip = trips?.find((t) => t.status !== "completed") ?? [...(trips ?? [])].sort((x, y) => (y.completed_at ?? "").localeCompare(x.completed_at ?? ""))[0];
  if (!trip) return null;
  await applyRouteAndTrip(next, trip.route_id, trip);

  const { data: tripStudents } = await supabase.from("trip_students").select("status,students(id,full_name,grade,photo_path)").eq("trip_id", trip.id);
  if (tripStudents?.length) {
    next.students = tripStudents.flatMap((row) => { const st = one(row.students as StudentJoin); return st ? [{ id: st.id, name: st.full_name, grade: st.grade ?? "—", status: row.status, photo: st.photo_path ?? null }] : []; });
  } else {
    const { data: assigned } = await supabase.from("student_route_assignments").select("students(id,full_name,grade,photo_path)").eq("route_id", trip.route_id).eq("status", "active");
    next.students = (assigned ?? []).flatMap((row) => { const st = one(row.students as StudentJoin); return st ? [{ id: st.id, name: st.full_name, grade: st.grade ?? "—", status: "not_boarded", photo: st.photo_path ?? null }] : []; });
  }
  if (next.students[0]) next.student = { ...next.student, id: next.students[0].id, name: next.students[0].name, grade: next.students[0].grade, status: tripStudentLabel[next.students[0].status] ?? next.students[0].status };
  // أسماء الطلاب عند كل محطة (للخريطة وقائمة المحطات)
  const [{ data: rStops }, { data: assigns }] = await Promise.all([
    supabase.from("route_stops").select("id,stop_order").eq("route_id", trip.route_id).order("stop_order"),
    supabase.from("student_route_assignments").select("stop_id,students(full_name)").eq("route_id", trip.route_id).eq("status", "active"),
  ]);
  const byStop = new Map<string, string[]>();
  for (const a of assigns ?? []) { const st = one(a.students as StudentJoin); if (st && a.stop_id) byStop.set(a.stop_id, [...(byStop.get(a.stop_id) ?? []), st.full_name]); }
  (rStops ?? []).forEach((rs, i) => { if (next.route.stops[i]) next.route.stops[i].students = byStop.get(rs.id) ?? []; });
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

// بدون إنترنت: السائق يبقى على آخر بيانات رحلته المحفوظة على الجهاز. null تعني «أبقِ ما على الشاشة».
// النسخة المحفوظة لا تُكتب إلا لرحلة السائق، فلا نعتمد على حالة الدور (قد لا تكون ضُبطت بعد عند أول تحميل).
async function loadMasariDataOrCache(childId?: string | null): Promise<MasariData | null> {
  try { return await loadMasariData(childId); }
  catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    const uid = (await supabase.auth.getSession()).data.session?.user.id;
    return uid ? cachedDriverData<MasariData>(uid, riyadhToday()) : null;
  }
}
async function loadMasariData(childId?: string | null): Promise<MasariData> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (session) {
    const { data: accessData, error: accessError } = await supabase.rpc("my_access");
    if (accessError && isNetworkError(accessError)) throw new OfflineError();
    const role = roleFromAccess(accessData as MyAccess | null);
    if (role === "driver" || role === "parent") {
      const roleData = role === "driver" ? await loadDriverData(session.user.id) : await loadParentData(session.user.id, childId);
      if (!roleData && role === "driver" && typeof navigator !== "undefined" && !navigator.onLine) throw new OfflineError();
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
  status: string; full_name: string | null; platform_roles: string[]; region?: string | null; privacy_version?: string | null;
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
type UserAccess = { role: Role | null; name: string; email: string; suspended: boolean; platformAdmin: boolean; requestedRole?: string; phone?: string; region?: string | null; privacyOk?: boolean; schoolRole?: string };
async function resolveUserAccess(session: Session): Promise<UserAccess> {
  const email = session.user.email ?? "";
  await supabase.rpc("claim_my_invites");
  const { data, error } = await supabase.rpc("my_access");
  const access = data as MyAccess | null;
  const name = access?.full_name || email.split("@")[0] || "مستخدم";
  const requestedRole = typeof session.user.user_metadata?.requested_role === "string" ? session.user.user_metadata.requested_role : undefined;
  const phone = typeof session.user.user_metadata?.phone === "string" ? session.user.user_metadata.phone : undefined;
  // بدون إنترنت: نستخدم آخر صلاحيات معروفة لهذا الحساب بدل شاشة «حسابك بانتظار التفعيل»
  if (error && isNetworkError(error)) { const cached = cachedAccess<UserAccess>(session.user.id); if (cached) return cached; }
  if (error) return { role: null, name, email, suspended: false, platformAdmin: false, requestedRole, phone };
  const result: UserAccess = { role: roleFromAccess(access), name, email, suspended: access?.status === "suspended", platformAdmin: Boolean(access?.platform_roles.includes("super_admin")), requestedRole, phone, schoolRole: access?.schools.find((m) => m.status === "active" && m.school_status === "active")?.role, region: access?.region ?? null, privacyOk: access?.privacy_version === PRIVACY_VERSION };
  if (result.role) cacheAccess(session.user.id, result);
  return result;
}

function Stat({ icon: Icon, label, value, detail, accent }: { icon: typeof Users; label: string; value: string; detail: string; accent: string }) {
  return <article className="stat-card"><div className={"stat-icon " + accent}><Icon /></div><div><p className="muted-label">{label}</p><strong className="stat-value">{value}</strong></div><p className="stat-detail">{detail}</p></article>;
}
function LiveRoute({ data, simulation, driverGps, parent = false }: { data: MasariData; simulation: SimulationState; driverGps?: DriverGps | null; parent?: boolean }) {
  const currentStop = data.route.stops[simulation.currentStopIndex] ?? data.route.stops[0];
  return <article className="panel map-panel">
    <div className="panel-head"><div><p className="eyebrow">تتبع مباشر</p><h2>{parent ? `رحلة ${data.student.name} إلى المدرسة` : `${data.route.name} — ${data.school.city}`}</h2></div><Badge className="live-badge"><span /> {simulation.active ? driverGps ? "GPS مباشر" : "بانتظار GPS" : "بانتظار بدء الرحلة"}</Badge></div>
    <TripMap stops={data.route.stops.map((st,i)=>({lat:st.lat,lng:st.lng,label:st.label,done:simulation.approvedStops.includes(i)}))} school={{...data.school.location,label:data.school.name}} home={parent?{...data.student.location,label:`بيت ${data.student.name}`}:null} bus={simulation.active&&driverGps?{lat:driverGps.lat,lng:driverGps.lng}:null} nextIndex={simulation.active?simulation.currentStopIndex:undefined}/>
    {simulation.active&&!driverGps&&<p className="map-gps-note"><AlertTriangle/> موقع الباص غير متاح الآن</p>}
    <div className="route-summary">
      <div><span className="summary-dot done"/><p>موعد البداية</p><strong>{data.route.scheduledTime}</strong></div><ChevronLeft />
      <div><span className="summary-dot active"/><p>{simulation.active ? "المحطة التالية" : "المحطة الأولى"}</p><strong>{currentStop?.label ?? data.student.address}</strong></div><ChevronLeft />
      <div><span className="summary-dot"/><p>حالة الطالب</p><strong>{studentStatusLabel[simulation.studentStatus]}</strong></div>
    </div>
  </article>;
}
function LocationEditor({ title, icon: Icon, value, editable, lockedNote, onSave }: { title: string; icon: typeof MapPin; value: LocationPoint; editable: boolean; lockedNote: string; onSave: (point: LocationPoint, updateStops: boolean) => void }) {
  const [draft, setDraft] = useState(()=>value);
  const [updateStops, setUpdateStops] = useState(true);
  const update = (key: keyof LocationPoint, next: string) => setDraft((current) => ({ ...current, [key]: key === "lat" || key === "lng" ? Number(next) : next }));
  const moved = Math.abs(draft.lat - value.lat) > 1e-6 || Math.abs(draft.lng - value.lng) > 1e-6;
  return <article className="panel location-card">
    <div className="panel-head"><div><p className="eyebrow">{title}</p><h2>{draft.label}</h2></div><Icon className="title-icon" /></div>
    {editable && <MapPicker value={Number.isFinite(draft.lat) && Number.isFinite(draft.lng) && (draft.lat || draft.lng) ? { lat: draft.lat, lng: draft.lng } : null} onChange={(p)=>setDraft((current)=>({ ...current, lat: p.lat, lng: p.lng }))} />}
    <div className="location-form">
      <label>العنوان<input value={draft.address} disabled={!editable} onChange={(event)=>update("address", event.target.value)} /></label>
      <label>خط العرض<input value={draft.lat} disabled={!editable} type="number" step="0.000001" onChange={(event)=>update("lat", event.target.value)} /></label>
      <label>خط الطول<input value={draft.lng} disabled={!editable} type="number" step="0.000001" onChange={(event)=>update("lng", event.target.value)} /></label>
    </div>
    {editable ? <>
      <label className="check-line" htmlFor="loc-stops"><input id="loc-stops" type="checkbox" checked={updateStops} onChange={(e)=>setUpdateStops(e.target.checked)} /> تحديث محطة المدرسة في كل المسارات (يُبلَّغ أولياء الأمور بالتغيير)</label>
      <Button className="wide-action" onClick={()=>{if(window.confirm(moved ? "سيتغير موقع المدرسة على كل الخرائط والمسارات. هل الموقع الجديد صحيح؟" : "حفظ موقع المدرسة؟"))onSave(draft, updateStops)}}><Check /> حفظ الموقع</Button>
    </> : <p className="readonly-note">{lockedNote}</p>}
  </article>;
}
function LocationsView({ data, role, schoolRole, simulation, saveStatus, onSaveLocation }: { data: MasariData; role: Role; schoolRole: string; simulation: SimulationState; saveStatus: string; onSaveLocation: (kind: "school" | "home", point: LocationPoint, updateStops?: boolean) => void }) {
  // موقع المدرسة يعدّله مدير/مديرة المدرسة فقط (وإدارة مساري).
  const editable = role === "school" && schoolRole === "school_admin";
  return <>
    <div className="welcome"><div><p className="eyebrow">المواقع الجغرافية</p><h1>موقع المدرسة والمسار</h1><p>تُبنى على موقع المدرسة المسارات وبرج المراقبة وتنبيهات الوصول.</p></div></div>
    {saveStatus && <div className="save-strip"><Check /><span>{saveStatus}</span></div>}
    {data.school.located === false && <p className="save-strip ops-message ops-error"><MapPin /><span>لم يُحدَّد موقع المدرسة بعد. حدده بدقة على الخريطة أو بالإحداثيات ثم احفظه.</span></p>}
    <section className="locations-grid">
      <LocationEditor key={`school-${data.school.location.lat}-${data.school.location.lng}`} title="المدرسة" icon={School} value={data.school.location} editable={editable} lockedNote="تعديل موقع المدرسة لمدير/مديرة المدرسة." onSave={(point, updateStops)=>onSaveLocation("school", point, updateStops)} />
    </section>
    <section className="main-grid location-main"><LiveRoute data={data} simulation={simulation} /><article className="panel">
      <div className="panel-head"><div><p className="eyebrow">محطات المسار</p><h2>{data.route.name}</h2></div><Route className="title-icon" /></div>
      {data.route.stops.map((stop, index)=><div className="location-row" key={`${stop.label}-${index}`}><span>{index + 1}</span><div><strong>{stop.label}</strong><p>{stop.time}</p></div><a className="stop-nav" href={navigateUrl(stop)} target="_blank" rel="noreferrer" aria-label={`فتح ${stop.label} في الخرائط`}><MapPin/></a></div>)}
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
function DriverDashboard({ onSkipStop, offlinePending = 0, offlineFailed = [], onDismissFailed, tripSaveTone = "ok", data, simulation, tripSaveStatus, driverGps, gpsStatus, onStart, onEnd, onApproveStop, onRefreshGps, onReportIssue, onStudentEvent, onScanned }: { onSkipStop?: () => void; offlinePending?: number; offlineFailed?: FailedItem[]; onDismissFailed?: () => void; tripSaveTone?: "ok" | "error"; onScanned: () => void; data: MasariData; simulation: SimulationState; tripSaveStatus: string; driverGps?: DriverGps | null; gpsStatus: string; onStart: () => void; onEnd: () => void; onApproveStop: () => void; onRefreshGps: () => void; onReportIssue: () => void; onStudentEvent: (studentId: string, event: AttendanceEvent) => void }) {
  const [scanning,setScanning]=useState(false);
  const currentStop = data.route.stops[simulation.currentStopIndex] ?? data.route.stops[0];
  const finished = simulation.approvedStops.length >= data.route.stops.length;
  const distanceToStop = driverGps && currentStop ? Math.round(distanceMeters(driverGps, currentStop)) : null;
  const stopRadius = currentStop?.radius ?? STOP_RADIUS_METERS;
  const allowedDistance = stopRadius + Math.min(driverGps?.accuracy ?? 0, 100);
  const withinStopRadius = distanceToStop !== null && distanceToStop <= allowedDistance;
  const canApprove = simulation.active && !finished && withinStopRadius;
  const approveLabel = finished ? "تم اعتماد كل المحطات" : !driverGps ? "فعّل GPS لاعتماد المحطة" : !withinStopRadius ? `تبعد ${distanceToStop}م عن المحطة` : "اعتماد محطة الوصول";
  const BOARDED = ["boarded", "boarded_return", "arrived_school", "dropped_home"];
  const students = data.students
    ? data.students.map((student) => ({ photo: student.photo ?? null, id: student.id, name: student.name, grade: student.grade, status: tripStudentLabel[student.status] ?? student.status, checked: BOARDED.includes(student.status), actions: simulation.active ? attendanceActions(data.trip?.direction, student.status) : [] }))
    : [{ id: "", name: data.student.name, grade: data.student.grade, status: studentStatusLabel[simulation.studentStatus], checked: simulation.studentStatus === "on_bus" || simulation.studentStatus === "arrived", actions: [] as { event: AttendanceEvent; label: string }[], photo: null as string | null }];
  const photoUrls = usePhotoUrls(students.map((st) => st.photo));
  const tripDone = data.trip?.status === "completed";
  return <>
    <div className="welcome driver-welcome"><div><p className="eyebrow">مسارك اليوم</p><h1>{data.trip?.direction === "to_home" ? "رحلة العودة" : "الرحلة الصباحية"} — {data.route.name}</h1><p>{data.route.stops.length} محطات · {students.length === 1 ? "طالب واحد" : `${students.length} طلاب`} · الباص {data.vehicle.number}</p></div>{tripDone ? <Badge className="safe-badge"><Check/> انتهت رحلة اليوم</Badge> : <Button className={simulation.active ? "danger-action" : "primary-action"} onClick={simulation.active ? onEnd : onStart}>{simulation.active ? <><X/> إنهاء الرحلة</> : <><Navigation/> بدء الرحلة وتفعيل الموقع</>}</Button>}</div>
    {simulation.active && <div className={`trip-live-strip ${driverGps ? "" : "gps-missing"}`}><span/><strong>{driverGps ? "GPS فعّال الآن" : "الرحلة بدأت والموقع غير متاح"}</strong><p>{driverGps ? `اعتماد المحطة متاح داخل نطاق ${stopRadius} متر فقط` : "اسمح للموقع من إعدادات المتصفح، ثم اضغط تحديث GPS"}</p></div>}
    {tripSaveStatus && <div className={`save-strip trip-save ${tripSaveTone==="error"?"trip-save-error":""}`} role={tripSaveTone==="error"?"alert":"status"}>{tripSaveTone==="error"?<AlertTriangle/>:<Check/>}<span>{tripSaveStatus}</span></div>}
    {offlineFailed.length>0 && <div className="save-strip trip-save-error offline-failed" role="alert"><AlertTriangle/><div><strong>تعذر إرسال {offlineFailed.length===1?"عملية محفوظة":`${offlineFailed.length} عمليات محفوظة`} بعد عودة الإنترنت</strong><ul>{offlineFailed.slice(-5).map((f)=><li key={f.id}>{f.label} ({new Date(f.at).toLocaleTimeString("ar-SA",{hour:"2-digit",minute:"2-digit"})}): {rpcError({ message: f.error })}</li>)}</ul><p>سجّلها يدويًا مرة أخرى أو أبلغ المدرسة.</p><Button size="sm" variant="outline" onClick={onDismissFailed}>فهمت</Button></div></div>}
    {offlinePending>0 && <div className="save-strip ops-message offline-strip"><span>{offlinePending} عملية محفوظة على الجهاز بانتظار الإنترنت. تابع رحلتك عاديًا.</span></div>}
    {data.trip && data.school.id && (data.trip.status==="scheduled"||data.trip.status==="ready") && <VehicleCheck tripId={data.trip.id} schoolId={data.school.id}/>}
    <article className="panel gps-panel">
      <div><p className="eyebrow">GPS الجهاز</p><strong>{driverGps ? "تم التقاط موقع السائق" : "بانتظار السماح بالموقع"}</strong><span>{gpsStatus || "اضغط بدء الرحلة وسيطلب المتصفح إذن الموقع."}</span></div>
      {driverGps && <div className="gps-coords"><MapPin/><span>{driverGps.lat.toFixed(5)}, {driverGps.lng.toFixed(5)}</span><small>دقة {Math.round(driverGps.accuracy ?? 0)}م</small></div>}
      <Button variant="outline" onClick={onRefreshGps}><Navigation/> تحديث GPS الآن</Button>
    </article>
    {data.route.stops.length>0&&<article className="panel driver-map-panel">
      <div className="panel-head"><div><p className="eyebrow">خريطة المسار</p><h2>{finished ? `الوجهة: ${data.school.name}` : `المحطة التالية: ${currentStop?.label ?? "—"}`}</h2>{!finished&&currentStop?.students?.length ? <p className="muted-label">{currentStop.students.join("، ")}</p> : null}</div></div>
      <TripMap stops={data.route.stops.map((st,i)=>({lat:st.lat,lng:st.lng,label:st.label,done:simulation.approvedStops.includes(i),students:st.students}))} school={{...data.school.location,label:data.school.name}} bus={driverGps?{lat:driverGps.lat,lng:driverGps.lng}:null} nextIndex={finished?undefined:simulation.currentStopIndex} follow={simulation.active}/>
      <div className="nav-actions">{!finished&&currentStop&&<a className="nav-link primary" href={navigateUrl(currentStop)} target="_blank" rel="noreferrer"><Navigation/> الملاحة إلى المحطة التالية</a>}<a className="nav-link" href={fullRouteUrl([...data.route.stops.filter((_,i)=>!simulation.approvedStops.includes(i)),data.school.location])} target="_blank" rel="noreferrer"><Route/> المسار كاملًا في خرائط Google</a></div>
    </article>}
    <section className="driver-grid"><article className="panel stops">
      <div className="panel-head"><div><p className="eyebrow">{finished ? "اكتملت الرحلة" : "المحطة الحالية"}</p><h2>{finished ? data.school.name : currentStop?.label}</h2></div><div className="eta-pill">{finished ? "تم" : currentStop?.time}</div></div>
      <div className="stop-progress"><Progress value={data.route.stops.length ? (simulation.approvedStops.length / data.route.stops.length) * 100 : 0}/><span>{simulation.approvedStops.length} من {data.route.stops.length} محطات معتمدة</span></div>
      {data.trip&&students.length>0&&!tripDone&&<Button className="wide-action scan-action" disabled={data.trip.status!=="in_progress"} onClick={()=>setScanning(true)}><ScanLine/> {data.trip.status==="in_progress"?"مسح بطاقة طالب":"ابدأ الرحلة لتفعيل مسح البطاقات"}</Button>}
      {scanning&&data.trip&&<QrScanner tripId={data.trip.id} names={Object.fromEntries((data.students??[]).map((st)=>[st.id,st.name]))} gps={driverGps?{lat:driverGps.lat,lng:driverGps.lng}:null} onClose={()=>setScanning(false)} onRecorded={onScanned}/>}
      <div className="student-checklist">{students.length===0&&<p className="muted-label">لا يوجد طلاب في هذه الرحلة.</p>}{students.map((student)=><div key={student.id || student.name} className={"check-row "+(student.checked?"checked":"")}><StudentAvatar url={student.photo ? photoUrls[student.photo] : null} name={student.name}/><div><strong>{student.name}</strong><p>{student.grade} · {student.status}</p></div>{student.actions.length ? <span className="student-actions">{student.actions.map((action)=><Button key={action.event} size="sm" variant="outline" onClick={()=>onStudentEvent(student.id, action.event)}>{action.label}</Button>)}</span> : <span className="check-box">{student.checked && <Check/>}</span>}</div>)}</div>
      {!finished && <p className={`geofence-status ${withinStopRadius ? "ready" : "blocked"}`}><MapPin/>{distanceToStop === null ? "لا يمكن الاعتماد دون موقع GPS فعلي" : withinStopRadius ? `داخل نطاق المحطة · ${distanceToStop} متر` : `اقترب حتى 250 متر من ${currentStop?.label}`}</p>}
      <Button className="wide-action" disabled={!canApprove} onClick={onApproveStop}><Check/> {approveLabel}</Button>
      {simulation.active&&!finished&&currentStop&&onSkipStop&&<button type="button" className="skip-stop-link" onClick={onSkipStop}>لا أستطيع الوصول إلى {currentStop.label}؟ تخطَّ المحطة بسبب</button>}
    </article><article className="panel compact-route"><div className="panel-head"><div><p className="eyebrow">تسلسل الرحلة</p><h2>نقاط التوقف</h2></div></div>
      {data.route.stops.map((stop,i)=><div className={"timeline-row "+(simulation.approvedStops.includes(i)?"passed":i===simulation.currentStopIndex?"current":"")} key={stop.id ?? `${stop.label}-${i}`}><span>{simulation.approvedStops.includes(i)?<Check/>:i+1}</span><div><strong>{stop.label}</strong><p>{[stop.time,stop.students?.length?stop.students.join("، "):""].filter(Boolean).join(" · ")}</p></div><a className="stop-nav" href={navigateUrl(stop)} target="_blank" rel="noreferrer" aria-label={`الملاحة إلى ${stop.label}`}><Navigation/></a></div>)}
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

function EmptyState({ role }: { role: Role }) {
  const hint = role === "parent" ? "لم يُربط حسابك بأي طالب بعد. ستظهر الرحلة هنا بعد أن تربطك المدرسة بابنك."
    : role === "driver" ? "لا توجد رحلات مسندة إليك بعد. ستظهر رحلة اليوم بعد أن تسندك المدرسة إلى مسار."
    : "لا توجد بيانات تشغيل بعد. أضف مدرسة ثم الباصات والمسارات والطلاب لتظهر هنا.";
  return <article className="panel empty-state"><div className="brand-mark large"><School/></div><h2>لا توجد بيانات بعد</h2><p>{hint}</p></article>;
}
function AuthPage({ onAuthenticated, initialMode = "login", initialRole, onBack }: { onAuthenticated: (session: Session) => Promise<void>; initialMode?: "login" | "signup"; initialRole?: SignupRole; onBack?: () => void }) {
  // الدخول موحّد: البريد وكلمة المرور فقط، والنظام يعرف الدور من الخادم.
  // التسجيل الجديد: يختار الدور، ثم يكمل طلبه (اختيار المدرسة) بعد إنشاء الحساب.
  const [selectedRole, setSelectedRole] = useState<SignupRole | null>(initialRole ?? null);
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";
  const phoneOk = /^\+?[0-9\s-]{9,20}$/.test(phone.trim());
  const canSubmit = !!email.trim() && password.length >= (signup ? 8 : 6) && (!signup || (!!selectedRole && name.trim().length >= 3 && phoneOk && agreed));
  const submitAuth = async () => {
    setBusy(true); setMessage("");
    const credentials = { email: email.trim(), password };
    const result = !signup
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp({ ...credentials, options: { data: { full_name: name.trim(), phone: phone.trim(), requested_role: selectedRole, privacy_version: PRIVACY_VERSION } } });
    setBusy(false);
    if (result.error) {
      setMessage(!signup ? "البريد أو كلمة المرور غير صحيحة." : /registered|exists/i.test(result.error.message) ? "هذا البريد مسجّل مسبقًا. سجّل الدخول به." : "تعذر إنشاء الحساب. تأكد من البريد وأن كلمة المرور 8 أحرف على الأقل.");
      return;
    }
    if (result.data.session) {
      try { await onAuthenticated(result.data.session); }
      catch { setMessage("تعذر فتح الحساب الآن. حاول مرة أخرى."); await supabase.auth.signOut({ scope: "local" }); }
    } else setMessage("أنشأنا حسابك. افتح الرابط الذي أرسلناه إلى بريدك لتأكيده، ثم سجّل الدخول لإكمال طلبك واختيار المدرسة.");
  };
  const roleInfo = SIGNUP_ROLES.find((r) => r.role === selectedRole);
  return <main dir="rtl" className="auth-page">
    <section className="auth-hero">{onBack&&<button className="auth-back" onClick={onBack}>→ الصفحة الرئيسية</button>}<LangToggle/><div className="brand-mark large"><BusFront/></div><p className="eyebrow">مساري</p><h1>{signup ? "حساب جديد في مساري" : "تسجيل الدخول"}</h1><p>{signup ? "اختر دورك وأنشئ حسابك، ثم اختر المدرسة وأرسل طلبك. بعد اعتماده تدخل ببريدك وكلمة المرور فقط." : "ادخل ببريدك وكلمة المرور، وسيفتح لك النظام صفحتك حسب دورك: مدير النظام، الإدارة التعليمية، المدرسة، السائق، أو ولي الأمر."}</p></section>
    <section className="auth-shell">
      <div className="auth-tabs"><button className={!signup?"active":""} onClick={()=>{setMode("login");setMessage("")}}>تسجيل الدخول</button><button className={signup?"active":""} onClick={()=>{setMode("signup");setMessage("")}}>حساب جديد</button></div>
      {signup && <div className="role-cards">{SIGNUP_ROLES.map((item)=><button key={item.role} className={selectedRole===item.role?"active":""} onClick={()=>setSelectedRole(item.role)}><item.icon/><strong>{item.title}</strong><span>{item.desc}</span></button>)}</div>}
      <div className="auth-form-card">{forgot ? <ForgotPassword initialEmail={email} onBack={()=>setForgot(false)}/> : <>
        {signup && <div className="auth-form-head">{roleInfo ? <roleInfo.icon/> : <Users/>}<div><p className="eyebrow">إنشاء حساب</p><h2>{roleInfo ? roleInfo.title : "اختر دورك أولًا"}</h2></div></div>}
        {signup&&<label>الاسم الكامل<input value={name} onChange={(e)=>setName(e.target.value)} autoComplete="name"/></label>}
        {signup&&<label>الجوال<input value={phone} onChange={(e)=>setPhone(e.target.value)} dir="ltr" inputMode="tel" placeholder="05xxxxxxxx" autoComplete="tel"/></label>}
        <label>البريد الإلكتروني<input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" dir="ltr" placeholder="name@example.com" autoComplete="email"/></label>
        <label>كلمة المرور<input value={password} onChange={(e)=>setPassword(e.target.value)} type="password" placeholder="••••••••" autoComplete={signup?"new-password":"current-password"} onKeyDown={(e)=>{if(e.key==="Enter"&&canSubmit&&!busy)void submitAuth()}}/></label>
        {signup&&<label className="consent-check" htmlFor="signup-consent"><input id="signup-consent" type="checkbox" checked={agreed} onChange={(e)=>setAgreed(e.target.checked)}/> أوافق على <a href={PRIVACY_URL} target="_blank" rel="noreferrer">سياسة الخصوصية</a></label>}
        {message&&<p className="auth-message">{message}</p>}
        <Button className="wide-action" onClick={submitAuth} disabled={busy || !canSubmit}>{busy ? "جارٍ التحقق…" : !signup ? "دخول" : "إنشاء الحساب والمتابعة"}</Button>
        {!signup ? <button className="text-link" onClick={()=>setForgot(true)}>نسيت كلمة المرور؟</button> : password.length > 0 && password.length < 8 && <p className="muted-label">كلمة المرور 8 أحرف على الأقل.</p>}
      </>}</div>
    </section>
  </main>;
}
// عنصر القائمة الجانبية: يغلقها على الجوال بعد الاختيار.
function NavButton({ active, onSelect, label, icon: Icon }: { active: boolean; onSelect: () => void; label: string; icon: typeof LayoutDashboard }) {
  const { setOpenMobile } = useSidebar();
  return <SidebarMenuButton isActive={active} onClick={()=>{onSelect();setOpenMobile(false)}} tooltip={label}><Icon/><span>{label}</span></SidebarMenuButton>;
}
// شريط الجوال يعرض أول 3 صفحات، و«المزيد» يفتح القائمة الكاملة.
function MoreButton({ active }: { active: boolean }) {
  const { setOpenMobile } = useSidebar();
  return <button className={active?"active":""} onClick={()=>setOpenMobile(true)}><Menu/><span>المزيد</span></button>;
}
// رابط الاستعادة يُقرأ من العنوان في المتصفح فقط (لا يتعارض مع العرض على الخادم).
const noopSubscribe = () => () => {};
// من صفحة «حذف الحساب» العامة: بعد الدخول نفتح «حسابي» مباشرة
const OPEN_ACCOUNT_KEY = "masari-open-account";
const requestOpenAccount = () => { try { sessionStorage.setItem(OPEN_ACCOUNT_KEY, "1"); } catch { /* محجوب */ } };
const takeOpenAccount = () => { try { const v = sessionStorage.getItem(OPEN_ACCOUNT_KEY) === "1"; sessionStorage.removeItem(OPEN_ACCOUNT_KEY); return v; } catch { return false; } };
const subscribeHash = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };
export default function Home() {
  const [entered,setEntered]=useState(false); const [role,setRole]=useState<Role>("executive"); const [view,setView]=useState<View>("dashboard"); const [online,setOnline]=useState(()=>typeof navigator === "undefined" ? true : navigator.onLine); const [data,setData]=useState<MasariData>(blankData); const [simulation,setSimulation]=useState<SimulationState>(initialSimulation); const [feedbackRows,setFeedbackRows]=useState<FeedbackItem[]>([]); const [saveStatus,setSaveStatus]=useState(""); const [tripSaveStatus,setTripSaveStatus]=useState(""); const [tripSaveTone,setTripSaveTone]=useState<"ok"|"error">("ok"); const [gpsStatus,setGpsStatus]=useState(""); const [driverGps,setDriverGps]=useState<DriverGps | null>(null); const [tripEvents,setTripEvents]=useState<TripEventRow[]>([]); const [notificationsOpen,setNotificationsOpen]=useState(false); const [activeTripContext,setActiveTripContext]=useState<TripContext | null>(null); const [authMode,setAuthMode]=useState<AuthMode>("demo"); const [accountName,setAccountName]=useState(""); const [pendingAccount,setPendingAccount]=useState<UserAccess | null>(null); const recoveryLink=useSyncExternalStore(noopSubscribe,isRecoveryLink,()=>false); const [recoveryEvent,setRecoveryEvent]=useState(false); const [recoveryClosed,setRecoveryClosed]=useState(false); const recovering=!recoveryClosed&&(recoveryLink||recoveryEvent); const [platformAdmin,setPlatformAdmin]=useState(false); const [authView,setAuthView]=useState<"landing"|"login"|"school"|"parent">("landing"); const [accessRegion,setAccessRegion]=useState<string|null>(null); const [schoolRole,setSchoolRole]=useState("school_admin"); const [accountEmail,setAccountEmail]=useState(""); const [needsConsent,setNeedsConsent]=useState(false); const [disclosureFor,setDisclosureFor]=useState<"start"|"refresh"|null>(null); const deleteHash=useSyncExternalStore(subscribeHash,()=>window.location.hash==="#delete-account",()=>false); const privacyHash=useSyncExternalStore(subscribeHash,()=>window.location.hash==="#privacy",()=>false); const shareToken=useSyncExternalStore(subscribeHash,shareTokenFromHash,()=>null);
  const gpsWatchRef = useRef<(() => void) | null>(null);
  // أي رحلة يتتبعها GPS الآن، ورقم آخر طلب تشغيل (حتى لا يعمل متتبعان معًا إذا تزامن طلبان)
  const gpsTripRef = useRef<string | null>(null);
  const gpsTokenRef = useRef(0);
  const lastGpsSaveRef = useRef(0);
  const statusTimerRef = useRef<number | null>(null);
  const selectedChildRef = useRef<string | null>(null);
  const loadSeqRef = useRef(0);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const eventsChannelRef = useRef<RealtimeChannel | null>(null);
  useEffect(()=>{installErrorReporter()},[]);
  useEffect(()=>{const a=()=>setOnline(true),b=()=>setOnline(false);window.addEventListener("online",a);window.addEventListener("offline",b);if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});return()=>{window.removeEventListener("online",a);window.removeEventListener("offline",b)}},[]);
  useEffect(()=>{let alive=true;const refresh=()=>{const seq=++loadSeqRef.current;return loadMasariDataOrCache(selectedChildRef.current).then((next)=>{if(!next||!alive||seq!==loadSeqRef.current)return;setData(next);const sim=simulationFromTrip(next);if(sim)setSimulation(sim)}).catch(()=>{})};refresh();const {data:{subscription}}=supabase.auth.onAuthStateChange((event)=>{if(event==="PASSWORD_RECOVERY"){setRecoveryClosed(false);setRecoveryEvent(true)}void refresh()});return()=>{alive=false;subscription.unsubscribe()}},[]);
  useEffect(()=>{let alive=true;supabase.auth.getSession().then(async({data:sessionData})=>{if(!alive||!sessionData.session)return;const access=await resolveUserAccess(sessionData.session);if(!alive)return;setNeedsConsent(access.privacyOk===false);if(!access.role){setPendingAccount(access);return}setRole(access.role);setAccountName(access.name);setPlatformAdmin(access.platformAdmin);setSchoolRole(access.schoolRole??"school_admin");setAccessRegion(access.region??null);setAccountEmail(access.email);setAuthMode("authenticated");setFeedbackRows([]);setEntered(true)}).catch(()=>{});return()=>{alive=false}},[]);
  useEffect(()=>()=>{gpsWatchRef.current?.(); if(realtimeChannelRef.current) void supabase.removeChannel(realtimeChannelRef.current); if(eventsChannelRef.current) void supabase.removeChannel(eventsChannelRef.current)},[]);
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
  const {count:offlinePending,failed:offlineFailed}=useOfflineQueue(); useEffect(()=>{applyLang()},[]); const nav=useMemo(()=>{const base=role==="executive"&&platformAdmin?platformNav:role==="school"?schoolNavFor(schoolRole):navByRole[role];return authMode==="authenticated"?[...base,{id:"account" as View,label:"حسابي",icon:UserRound}]:base},[role,platformAdmin,schoolRole,authMode]); const notifications=useMemo(()=>authMode==="authenticated" ? dbNotes.map((n)=>({id:n.id,title:n.title,body:n.body??"",time:formatEventTime(n.created_at),tone:noteTone(n.type)})) : data.source==="empty" ? [] : buildNotifications(data, simulation, driverGps, tripEvents, feedbackRows),[authMode, dbNotes, data, simulation, driverGps, tripEvents, feedbackRows]);
  const unreadCount = authMode==="authenticated" ? dbNotes.filter((n)=>!n.read_at).length : notifications.length;
  const toggleNotifications=()=>{const opening=!notificationsOpen;setNotificationsOpen(opening);if(opening&&authMode==="authenticated"&&dbNotes.some((n)=>!n.read_at)){const ids=dbNotes.filter((n)=>!n.read_at).map((n)=>n.id);const now=new Date().toISOString();setDbNotes((cur)=>cur.map((n)=>ids.includes(n.id)?{...n,read_at:now}:n));void supabase.from("notifications").update({read_at:now}).in("id",ids).then(()=>{})}};
  const enterAuthenticated=async(session: Session)=>{const access=await resolveUserAccess(session);setNeedsConsent(access.privacyOk===false);if(!access.role){setPendingAccount(access);return}setPendingAccount(null);setRole(access.role);setAccountName(access.name);setPlatformAdmin(access.platformAdmin);setSchoolRole(access.schoolRole??"school_admin");setAccessRegion(access.region??null);setAccountEmail(access.email);setAuthMode("authenticated");setFeedbackRows([]);setView(takeOpenAccount()?"account":"dashboard");setEntered(true);void refreshNativePush()};
  const stopGpsTracking=()=>{gpsTokenRef.current++;gpsTripRef.current=null;if(gpsWatchRef.current){gpsWatchRef.current();gpsWatchRef.current=null}setGpsStatus("تم إيقاف تتبع GPS.")};
  const stopRealtimeTracking=()=>{if(realtimeChannelRef.current){void supabase.removeChannel(realtimeChannelRef.current);realtimeChannelRef.current=null}};
  const stopEventsRealtime=()=>{if(eventsChannelRef.current){void supabase.removeChannel(eventsChannelRef.current);eventsChannelRef.current=null}};
  const signOut=async()=>{clearOfflineCache();if(authMode==="authenticated"){await forgetNativePushToken().catch(()=>{});await supabase.auth.signOut();}stopGpsTracking();stopRealtimeTracking();stopEventsRealtime();setAuthMode("demo");setAccountName("");setEntered(false);setView("dashboard");setSimulation(initialSimulation);setActiveTripContext(null);setTripSaveStatus("");setDriverGps(null);setTripEvents([]);setFeedbackRows([]);setNotificationsOpen(false)};
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
  const saveLocation=async(kind: "school" | "home", point: LocationPoint, updateStops = true)=>{
    setData((current)=>{
      if (kind === "school") return { ...current, school: { ...current.school, location: point } };
      return { ...current, student: { ...current.student, address: point.address, location: point }, route: { ...current.route, stops: current.route.stops.map((stop)=>stop.studentName === current.student.name || stop.label.includes("النسيم") ? { ...stop, label: point.address.includes("النسيم") ? "النسيم - شارع عبدالله بن عمر" : stop.label, lat: point.lat, lng: point.lng } : stop) } };
    });
    setSaveStatus("تم تحديث الموقع على الشاشة.");
    try {
      const targetId = kind === "school" ? data.school.id : data.student.id;
      if (authMode !== "authenticated" || !targetId) throw new Error("NOT_SAVED");
      const { error } = kind === "school"
        ? await supabase.rpc("school_set_location", { p_school: targetId, p_lat: point.lat, p_lng: point.lng, p_address: point.address, p_update_stops: updateStops })
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
  // الأخطاء تبقى ظاهرة أطول وباللون الأحمر حتى لا تفوت السائق
  const showTripSaveStatus=(message: string, tone: "ok"|"error"="ok")=>{setTripSaveStatus(message);setTripSaveTone(tone);if(statusTimerRef.current!==null)window.clearTimeout(statusTimerRef.current);statusTimerRef.current=window.setTimeout(()=>setTripSaveStatus(""), tone==="error"?15000:5200)};
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
  const reloadData=async()=>{
    const seq=++loadSeqRef.current;
    const next=await loadMasariDataOrCache(selectedChildRef.current);
    if(!next)return data;
    if(seq!==loadSeqRef.current)return next;setData(next);const sim=simulationFromTrip(next);if(sim)setSimulation(sim);return next};
  // نحفظ آخر حالة لرحلة السائق (ومنها ما سُجّل بدون إنترنت) لتظهر إذا أُعيد فتح التطبيق بلا اتصال
  useEffect(()=>{
    if(role!=="driver"||authMode!=="authenticated"||!data.trip)return;
    void supabase.auth.getSession().then(({ data: sd })=>{ const uid=sd.session?.user.id; if(uid) cacheDriverData(uid, riyadhToday(), data); });
  },[role, authMode, data]);
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
    const row = { trip_id: tripId, latitude: point.lat, longitude: point.lng, accuracy: point.accuracy ?? null, speed: point.speed ?? null, recorded_at: point.updatedAt ?? new Date().toISOString() };
    const { error } = await supabase.from("vehicle_locations").insert(row);
    if (error && isNetworkError(error)) { enqueue({ kind: "insert", table: "vehicle_locations", row }).catch(()=>{}); setGpsStatus("لا يوجد إنترنت: يُحفظ الموقع على الجهاز ويُرسل عند عودة الاتصال."); return; }
    setGpsStatus(error ? "GPS يعمل على الشاشة، لكن تعذر حفظ الموقع." : "تم حفظ موقع الباص.");
  };
  const handleGpsPosition=(fix: Fix, context?: TripContext | null)=>{
    const nextPoint: DriverGps = {
      label: "موقع السائق الحالي",
      address: isNativeApp() ? "GPS من تطبيق مساري (يعمل في الخلفية)" : "GPS مباشر من جهاز السائق",
      lat: fix.lat,
      lng: fix.lng,
      accuracy: fix.accuracy,
      speed: fix.speed,
      updatedAt: new Date().toISOString(),
    };
    setDriverGps(nextPoint);
    setGpsStatus(`آخر تحديث GPS بدقة ${Math.round(fix.accuracy)} متر.`);
    void persistGpsLocation(nextPoint, context);
  };
  const startGpsTracking=(context?: TripContext | null)=>{
    setGpsStatus("نطلب إذن الموقع من الجهاز…");
    gpsWatchRef.current?.(); gpsWatchRef.current=null;
    const token=++gpsTokenRef.current;
    gpsTripRef.current=context?.tripId ?? "local";
    void watchLocation((fix)=>handleGpsPosition(fix, context), setGpsStatus).then((stop)=>{
      // طلب أحدث سبقنا (أو أُوقف التتبع): نوقف هذا المتتبع فورًا
      if(token!==gpsTokenRef.current){stop();return}
      gpsWatchRef.current=stop;
    }).catch(()=>{if(token===gpsTokenRef.current){gpsTripRef.current=null;setGpsStatus("تعذر تشغيل تتبع الموقع.")}});
  };
  // الرحلة الجارية تستمر في إرسال الموقع حتى لو أُغلق التطبيق وفُتح من جديد، أو عاد من الخلفية،
  // أو أُعيد تحميل الصفحة: نعيد تشغيل التتبع تلقائيًا، ونوقفه إذا انتهت الرحلة من مكان آخر.
  useEffect(()=>{
    if(role!=="driver"||authMode!=="authenticated")return;
    if(!liveTripId){ if(gpsTripRef.current) stopGpsTracking(); return; }
    const context={ tripId: liveTripId };
    if(gpsTripRef.current!==liveTripId&&hasLocationDisclosure()){ setActiveTripContext(context); startGpsTracking(context); }
    // في المتصفح قد يتوقف GPS والشاشة مطفأة؛ تطبيق الجوال يتتبع في الخلفية فلا يحتاج ذلك
    const onVisible=()=>{ if(document.visibilityState==="visible"&&!isNativeApp()) startGpsTracking(context); };
    document.addEventListener("visibilitychange", onVisible);
    return ()=>document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[role, authMode, liveTripId]);
  const refreshGpsNow=()=>{
    if(!hasLocationDisclosure()){setDisclosureFor("refresh");return}
    setGpsStatus("جارٍ تحديث موقع GPS…");
    void locateOnce().then((fix)=>handleGpsPosition(fix, activeTripContext)).catch(()=>setGpsStatus("تعذر قراءة الموقع. اسمح للموقع باستخدام GPS."));
  };
  const startTrip=()=>{
    // إفصاح واضح داخل التطبيق قبل أول طلب لإذن الموقع (سياسة Google Play وApple)
    if(!hasLocationDisclosure()){setDisclosureFor("start");return}
    if (authMode !== "authenticated") {
      setSimulation({ active: true, currentStopIndex: 0, approvedStops: [], studentStatus: "approaching" });
      startGpsTracking(null);
      return;
    }
    const tripId = data.trip?.id;
    if (!tripId) { showTripSaveStatus("لا توجد رحلة مسندة إليك اليوم."); return; }
    void (async()=>{
      const { error } = await supabase.rpc("start_trip", { p_trip: tripId });
      if (error) { showTripSaveStatus(rpcError(error),"error"); return; }
      const context = { tripId };
      setActiveTripContext(context);
      startGpsTracking(context);
      await reloadData();
      showTripSaveStatus("بدأت الرحلة وتم إشعار أولياء الأمور.");
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
    if (!window.confirm("امشِ إلى آخر الباص وتأكد أنه خالٍ من الطلاب. هل تأكدت؟")) return;
    void (async()=>{
      const { data: res, error } = await supabase.rpc("complete_trip", { p_trip: tripId, p_bus_checked: true });
      if (error) { showTripSaveStatus(rpcError(error),"error"); return; }
      const r = res as { completed?: boolean; names?: string } | null;
      if (r && r.completed === false) { await reloadData(); window.alert(`لا يمكن إنهاء الرحلة: ما زال في الباص ${r.names ?? "طالب"}. تأكد من نزوله وسجّله، وقد أُبلغت المدرسة.`); showTripSaveStatus(`ما زال في الباص: ${r.names ?? ""}. سجّل نزوله ثم أنهِ الرحلة.`); return; }
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
    if (error) { showTripSaveStatus(rpcError(error),"error"); return; }
    await reloadData();
    showTripSaveStatus(absent ? `تم تسجيل غياب ${data.student.name} اليوم، ولن ينتظره السائق.` : `تم إلغاء غياب ${data.student.name}.`);
  };
  const recordStudent=(studentId: string, event: AttendanceEvent)=>{void (async()=>{
    if (!data.trip) return;
    const args = {
      p_trip: data.trip.id, p_student: studentId, p_event: event,
      p_method: "manual", p_lat: driverGps?.lat ?? null, p_lng: driverGps?.lng ?? null,
    };
    const { error } = await supabase.rpc("record_attendance", args);
    if (error && isNetworkError(error)) {
      void enqueue({ kind: "rpc", name: "record_attendance", args });
      setData((current)=>({ ...current, students: current.students?.map((st)=>st.id===studentId ? { ...st, status: event } : st) }));
      showTripSaveStatus(`${attendanceDoneText[event]} (محفوظ على الجهاز، يُرسل عند عودة الإنترنت)`);
      return;
    }
    if (error) { showTripSaveStatus(rpcError(error),"error"); return; }
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
      const arriveArgs = { p_trip: data.trip.id, p_stop: stop.id, p_lat: driverGps.lat, p_lng: driverGps.lng, p_accuracy: driverGps.accuracy ?? null };
      const { data: result, error } = await supabase.rpc("arrive_at_stop", arriveArgs);
      if(error&&isNetworkError(error)){
        if(distance>(stop.radius??STOP_RADIUS_METERS)+Math.min(driverGps.accuracy??0,100)){showTripSaveStatus(`أنت تبعد ${distance} متر عن ${stop.label}.`);return}
        void enqueue({ kind: "rpc", name: "arrive_at_stop", args: arriveArgs });
        setData((current)=>({ ...current, route: { ...current.route, stops: current.route.stops.map((st, i)=>i===index ? { ...st, status: "arrived" } : st) } }));
        approveStop();
        showTripSaveStatus(`اعتُمدت ${stop.label} على الجهاز، وتُرسل عند عودة الإنترنت.`);
        return;
      }
      if(error){showTripSaveStatus(rpcError(error),"error");return}
      await reloadData();
      showTripSaveStatus(`تم اعتماد ${stop.label} من مسافة ${(result as { distance?: number } | null)?.distance ?? distance} متر.`);
      return;
    }
    const allowedDistance=(stop.radius??STOP_RADIUS_METERS)+Math.min(driverGps.accuracy??0,100);
    if(distance>allowedDistance){showTripSaveStatus(`أنت تبعد ${distance} متر عن ${stop.label}. اقترب حتى ${stop.radius??STOP_RADIUS_METERS} متر.`);return}
    showTripSaveStatus(`تم اعتماد ${stop.label} عبر GPS من مسافة ${distance} متر. الحفظ الدائم يحتاج تسجيل دخول فعلي.`);
    approveStop();
  })()};
  // محطة لا يمكن الوصول إليها (طريق مغلق، لا طلاب اليوم…): يتخطاها السائق بسبب مكتوب، فتُبلَّغ المدرسة
  // ويستطيع إكمال الرحلة. الخادم يرفض تخطي المدرسة أو تخطي محطة ليست التالية.
  const skipStop=()=>{void (async()=>{
    const index=simulation.currentStopIndex;
    const stop=data.route.stops[index];
    if(!simulation.active||!stop)return;
    const reason=window.prompt(`لماذا تتخطى محطة ${stop.label}؟\nمثال: الطريق مغلق، لا يوجد طلاب اليوم`)?.trim();
    if(!reason)return;
    if(authMode!=="authenticated"){approveStop();showTripSaveStatus(`تم تخطي ${stop.label}.`);return}
    if(!data.trip||!stop.id){showTripSaveStatus("ابدأ الرحلة أولاً.","error");return}
    const args={ p_trip: data.trip.id, p_stop: stop.id, p_reason: reason };
    const { error }=await supabase.rpc("skip_stop", args);
    if(error&&isNetworkError(error)){
      void enqueue({ kind: "rpc", name: "skip_stop", args });
      setData((current)=>({ ...current, route: { ...current.route, stops: current.route.stops.map((st, i)=>i===index ? { ...st, status: "skipped" } : st) } }));
      approveStop();
      showTripSaveStatus(`تم تخطي ${stop.label} على الجهاز، ويُرسل للمدرسة عند عودة الإنترنت.`);
      return;
    }
    if(error){showTripSaveStatus(rpcError(error),"error");return}
    await reloadData();
    showTripSaveStatus(`تم تخطي ${stop.label} وإبلاغ المدرسة.`);
  })()};
  useEffect(()=>{
    const onFlushed=(e: Event)=>{ const r=(e as CustomEvent<{ sent: number }>).detail; if(r?.sent){ void reloadData().catch(()=>{}); showTripSaveStatus(`أُرسلت ${r.sent} عملية محفوظة بعد عودة الإنترنت.`); } };
    window.addEventListener("masari-queue-flushed", onFlushed);
    return ()=>window.removeEventListener("masari-queue-flushed", onFlushed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[entered, authMode, role, data.trip?.id]);
  const reportIssue=()=>{
    if (!simulation.active) {
      showTripSaveStatus("ابدأ الرحلة أولاً قبل إرسال البلاغ.","error");
      return;
    }
    // تأكيد يمنع الإرسال بلمسة خاطئة أثناء القيادة
    if (!window.confirm("إرسال بلاغ طارئ إلى المدرسة وبرج المراقبة الآن؟")) return;
    const stop = data.route.stops[simulation.currentStopIndex] ?? data.route.stops[0];
    // موقع الباص الفعلي فقط؛ إن لم يتوفر GPS لا نرسل موقع المحطة على أنه موقع الباص
    const point = driverGps ? { lat: driverGps.lat, lng: driverGps.lng } : null;
    const note = `بلاغ طارئ من السائق${stop ? ` قرب ${stop.label}` : ""}${point ? "" : " (موقع الباص غير متاح)"}: يحتاج متابعة من برج المراقبة`;
    if (authMode !== "authenticated") { showTripSaveStatus("بلاغ تجريبي: الإرسال الفعلي يحتاج تسجيل دخول."); return; }
    if (!data.trip) return;
    const localId = `local-emergency-${Date.now()}`;
    const optimisticEvent: TripEventRow = { id: localId, eventType: "emergency", note: `${note} (جارٍ الإرسال…)`, createdAt: new Date().toISOString() };
    setTripEvents((current)=>[optimisticEvent, ...current].slice(0, 10));
    setNotificationsOpen(true);
    showTripSaveStatus("جارٍ إرسال البلاغ…");
    const args = { p_trip: data.trip.id, p_type: "emergency", p_description: note, p_lat: point?.lat ?? null, p_lng: point?.lng ?? null };
    const tripId = data.trip.id;
    void (async()=>{
      const { error } = await supabase.rpc("report_emergency", args);
      if (error && isNetworkError(error)) {
        void enqueue({ kind: "rpc", name: "report_emergency", args });
        setTripEvents((current)=>current.map((ev)=>ev.id===localId ? { ...ev, note: `${note} (محفوظ على الجهاز، يُرسل عند عودة الإنترنت)` } : ev));
        showTripSaveStatus("لا يوجد إنترنت: البلاغ محفوظ ويُرسل فور عودة الاتصال. اتصل بالمدرسة مباشرة الآن.","error");
        return;
      }
      if (error) {
        setTripEvents((current)=>current.filter((ev)=>ev.id!==localId));
        showTripSaveStatus(`لم يُرسل البلاغ: ${rpcError(error)} اتصل بالمدرسة مباشرة.`,"error");
        return;
      }
      await loadTripEvents(tripId);
      showTripSaveStatus("تم إرسال البلاغ الطارئ وإشعار المدرسة وبرج المراقبة.");
    })();
  };
  const leavePending=async()=>{await supabase.auth.signOut({ scope: "local" });setPendingAccount(null)};
  const recheckPending=async()=>{const {data:sessionData}=await supabase.auth.getSession();if(!sessionData.session)return;await enterAuthenticated(sessionData.session);await reloadData().catch(()=>{})};
  const finishRecovery=async()=>{setRecoveryClosed(true);setRecoveryEvent(false);const {data:sessionData}=await supabase.auth.getSession();if(sessionData.session)await enterAuthenticated(sessionData.session)};
  const cancelRecovery=async()=>{await supabase.auth.signOut({ scope: "local" });if(typeof window!=="undefined")window.history.replaceState(null,"",window.location.pathname);setRecoveryClosed(true);setRecoveryEvent(false)};
  if(shareToken) return <SharedTripPage token={shareToken} onClose={()=>{window.location.hash="";}}/>;
  if(deleteHash) return <DeleteAccountRequest onBack={()=>{window.location.hash="";}} onLogin={()=>{requestOpenAccount();window.location.hash="";if(entered)setView("account");else setAuthView("login")}}/>;
  if(privacyHash) return <PrivacyPolicy onBack={()=>{window.location.hash="";}}/>;
  if(needsConsent) return <ConsentGate onAccepted={()=>setNeedsConsent(false)} onSignOut={()=>{setNeedsConsent(false);void supabase.auth.signOut({ scope: "local" }).then(()=>window.location.reload())}}/>;
  if(recovering) return <ResetPasswordPage onDone={()=>void finishRecovery()} onCancel={()=>void cancelRecovery()}/>;
  if(pendingAccount) return <PendingAccount email={pendingAccount.email} name={pendingAccount.name} phone={pendingAccount.phone} requestedRole={pendingAccount.requestedRole} suspended={pendingAccount.suspended} onSignOut={()=>void leavePending()} onRecheck={recheckPending}/>;
  if(!entered && authView==="landing") return <Landing onLogin={()=>setAuthView("login")} onRegisterSchool={()=>setAuthView("school")} onFindSchool={()=>setAuthView("parent")}/>;
  if(!entered) return <AuthPage key={authView} onAuthenticated={enterAuthenticated} initialMode={authView==="school"||authView==="parent"?"signup":"login"} initialRole={authView==="school"?"school":authView==="parent"?"parent":undefined} onBack={()=>setAuthView("landing")}/>;
  return <div dir="rtl" className="masari-app"><LocationDisclosure open={disclosureFor!==null} onDecline={()=>{if(disclosureFor==="start")showTripSaveStatus("لا يمكن بدء الرحلة دون مشاركة الموقع.");setDisclosureFor(null)}} onAccept={()=>{const next=disclosureFor;setDisclosureFor(null);if(next==="start")startTrip();else if(next==="refresh")refreshGpsNow()}}/>{!online&&<div className="offline-banner">أنت تعمل دون اتصال — نعرض آخر بيانات محفوظة</div>}<SidebarProvider style={{"--sidebar-width":"17.5rem"} as React.CSSProperties}>
    <Sidebar side="right" variant="sidebar" collapsible="offcanvas" className="masari-sidebar"><SidebarHeader className="sidebar-brand"><div className="brand-mark"><BusFront/></div><div><strong>مساري</strong><span>إدارة النقل المدرسي</span></div></SidebarHeader><SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>{nav.map(item=><SidebarMenuItem key={item.id}><NavButton active={view===item.id} onSelect={()=>setView(item.id)} label={item.label} icon={item.icon}/></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent><SidebarFooter className="sidebar-footer"><div className="support-card"><MessageSquareText/><strong>تحتاج مساعدة؟</strong><p>{data.source==="empty" || (data.school.contactName==="—" && data.school.phone==="—") ? "تواصل مع إدارة مساري" : [data.school.contactName, data.school.phone].filter((v)=>v!=="—").join(" · ")}</p><button>تواصل معنا</button></div><div className="account-row"><span>{(accountName || data.school.contactName).charAt(0)}</span><div><strong>{accountName || (role==="parent"?data.parent.name:role==="driver"?data.driver.name:data.school.contactName)}</strong><p>{(role==="executive"&&platformAdmin?"مدير النظام":roleNames[role])}</p></div><button onClick={()=>void signOut()}>خروج</button></div></SidebarFooter></Sidebar>
    <SidebarInset className="app-inset"><header className="topbar"><div className="mobile-logo"><SidebarTrigger><Menu/></SidebarTrigger><div className="brand-mark"><BusFront/></div><strong>مساري</strong></div><div className="top-actions"><Badge variant="outline">{authMode==="authenticated"?"جلسة فعلية":simulation.active?driverGps?"GPS مباشر":"GPS غير متاح":data.source==="supabase"?"متصل بقاعدة البيانات":"بيانات محفوظة"}</Badge><Badge variant="outline" className="role-badge">{(role==="executive"&&platformAdmin?"مدير النظام":roleNames[role])}</Badge><button className="text-link top-exit" onClick={()=>void signOut()}>خروج</button><div className="notification-wrap"><button className="icon-button" aria-label="الإشعارات" onClick={toggleNotifications}><Bell/>{unreadCount>0&&<span>{unreadCount}</span>}</button>{notificationsOpen&&<div className="notification-popover"><div className="notification-head"><strong>الإشعارات</strong><small>{notifications.length} تحديثات</small></div>{authMode==="authenticated"&&<PushToggle compact/>}{authMode==="authenticated"&&role==="parent"&&<MessageChannels/>}{notifications.length===0&&<p className="muted-label notification-empty">لا توجد إشعارات بعد.</p>}{notifications.map((notification)=><div className="notification-item" key={notification.id}><span className={`notify-dot ${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.body}</p></div><small>{notification.time}</small></div>)}</div>}</div></div></header><main className="content">{authMode==="authenticated" && view==="account" ? <AccountPage name={accountName} email={accountEmail} roleLabel={role==="executive"&&platformAdmin?"مدير النظام":roleNames[role]} onDeleted={()=>window.location.reload()}/> : authMode==="authenticated" && role==="executive" ? (view==="schools" ? <AdminDirectory canManage={platformAdmin}/> : view==="reports" ? <><RegionReport/><DelayMap/></> : view==="control" ? <LiveControl canHandleEmergencies={platformAdmin}/> : platformAdmin && view==="users" ? <UsersAdmin myEmail={accountEmail}/> : platformAdmin && view==="billing" ? <AdminBilling/> : platformAdmin && view==="data" ? <DataManager/> : platformAdmin && view==="audit" ? <AuditLog/> : platformAdmin && view==="errors" ? <><ErrorLog/><MessageStats/></> : <RegionOverview region={accessRegion} platformAdmin={platformAdmin} onOpen={setView}/>) : authMode==="authenticated" && view==="schools" ? <AdminDirectory canManage={platformAdmin}/> : authMode==="authenticated" && view==="control" && (role==="school"||role==="executive") ? <LiveControl canHandleEmergencies={role==="school"||platformAdmin}/> : authMode==="authenticated" && role==="school" && OPS_VIEWS.includes(view) ? (data.school.id ? <SchoolOps schoolId={data.school.id} tab={view as OpsTab} isAdmin={schoolRole==="school_admin"}/> : <EmptyState role={role}/>) : authMode==="authenticated" && role==="school" && view==="feedback" ? <FeedbackList/> : authMode==="authenticated" && role==="school" && view==="billing" && data.school.id ? <SchoolBilling schoolId={data.school.id} schoolName={data.school.name}/> : authMode==="authenticated" && role==="parent" && view==="children" ? <><ParentChildren email={accountEmail}/><ShareLinks/></> : authMode==="authenticated" && view==="history" && (role==="parent"||role==="driver") ? <TripHistory role={role}/> : authMode==="authenticated" && role==="parent" && view==="locations" ? <ParentHomeLocations/> : authMode==="authenticated" && role==="parent" && view==="pickup" ? <ParentGate/> : authMode==="authenticated" && role==="parent" && view==="chat" ? <ParentChat/> : authMode==="authenticated" && role==="parent" && view==="fees" ? <ParentFees/> : authMode==="authenticated" && role==="school" && view==="chat" && data.school.id ? <SchoolChat schoolId={data.school.id}/> : authMode==="authenticated" && role==="school" && view==="fees" && schoolRole==="school_admin" && data.school.id ? <SchoolFees schoolId={data.school.id} schoolName={data.school.name}/> : authMode==="authenticated" && role==="school" && view==="reports" && data.school.id ? <><SchoolReport schoolId={data.school.id}/><AttendancePanel schoolId={data.school.id}/><DelayMap schoolId={data.school.id}/></> : authMode==="authenticated" && role==="school" && view==="team" && schoolRole==="school_admin" && data.school.id ? <SchoolTeam schoolId={data.school.id}/> : authMode==="authenticated" && role==="school" && schoolRole==="gate" && data.school.id ? <SchoolGate schoolId={data.school.id}/> : authMode==="authenticated" && role==="school" && view==="gate" && data.school.id ? <SchoolGate schoolId={data.school.id}/> : data.source==="empty" && (view==="dashboard"||view==="control"||view==="locations") ? <EmptyState role={role}/> : view==="dashboard" ? role==="driver" ? <DriverDashboard onSkipStop={skipStop} offlinePending={offlinePending} offlineFailed={offlineFailed} onDismissFailed={dismissFailed} tripSaveTone={tripSaveTone} data={data} simulation={simulation} tripSaveStatus={tripSaveStatus} driverGps={driverGps} gpsStatus={gpsStatus} onStart={startTrip} onEnd={endTrip} onApproveStop={approveStopAndRecord} onRefreshGps={refreshGpsNow} onReportIssue={reportIssue} onStudentEvent={recordStudent} onScanned={()=>void reloadData()}/> : role==="parent" ? <ParentDashboard data={data} simulation={simulation} driverGps={driverGps} tripEvents={tripEvents} feedbackRows={feedbackRows} authMode={authMode} tripSaveStatus={tripSaveStatus} onSubmitFeedback={submitFeedback} onSelectChild={selectChild} onSetAbsence={setAbsence}/> : <ExecutiveDashboard data={data} simulation={simulation} driverGps={driverGps}/> : view==="control" ? <ControlTower data={data} simulation={simulation} driverGps={driverGps} tripEvents={tripEvents}/> : view==="locations" ? <LocationsView data={data} role={role} schoolRole={schoolRole} simulation={simulation} saveStatus={saveStatus} onSaveLocation={saveLocation}/> : <EmptyState role={role}/>}</main><nav className="mobile-nav">{(nav.length>5?nav.slice(0,3):nav).map(item=><button className={view===item.id?"active":""} onClick={()=>setView(item.id)} key={item.id}><item.icon/><span>{item.label}</span></button>)}{nav.length>5&&<MoreButton active={!nav.slice(0,3).some((item)=>item.id===view)}/>}</nav></SidebarInset>
  </SidebarProvider></div>;
}
