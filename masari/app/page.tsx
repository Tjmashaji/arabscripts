"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, Bell, BusFront, CalendarDays,
  Check, ChevronLeft, CircleDollarSign, Clock3, FileClock, GraduationCap,
  LayoutDashboard, MapPin, Menu, MessageSquareText, Navigation, Plus,
  RadioTower, Route, School, Search, ShieldCheck, UserPlus, Users, WalletCards, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";

type Role = "executive" | "school" | "driver" | "parent";
type AuthMode = "demo" | "authenticated";
type View = "dashboard" | "control" | "locations" | "schools" | "students" | "fleet" | "routes" | "trips" | "finance" | "reports" | "audit";
type LocationPoint = { label: string; address: string; lat: number; lng: number };
type DriverForm = { name: string; phone: string; email: string; plate: string; status: string };
type DriverRow = DriverForm & { capacity?: number; saved?: boolean };
type StudentForm = { name: string; grade: string; parentName: string; parentPhone: string; parentEmail: string; address: string; status: string };
type StudentRow = StudentForm & { saved?: boolean };
type RouteForm = { name: string; direction: "to_school" | "to_home"; scheduledTime: string; stopsText: string; status: string };
type RouteRow = { name: string; direction: string; scheduledTime: string; stops: string; status: string; saved?: boolean };
type MasariData = {
  source: "cached" | "supabase";
  school: { id?: string; name: string; city: string; contactName: string; phone: string; location: LocationPoint };
  vehicle: { number: string; plate: string; capacity: number };
  driver: { name: string; email: string };
  route: { name: string; scheduledTime: string; estimatedMinutes: number; stops: { label: string; time: string; lat: number; lng: number; studentName?: string | null }[] };
  student: { name: string; grade: string; address: string; status: string; location: LocationPoint };
  parent: { name: string; email: string; phone: string };
  ride: { date: string; status: string; studentStatus: string };
};
type SimulationState = {
  active: boolean;
  currentStopIndex: number;
  approvedStops: number[];
  studentStatus: "waiting" | "approaching" | "on_bus" | "arrived";
};
type TripContext = { tripId: string; driverId: string; routeId: string; studentId?: string | null };
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
    { id: "dashboard", label: "نظرة عامة", icon: LayoutDashboard }, { id: "students", label: "الطلاب", icon: GraduationCap },
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
const schoolLocation: LocationPoint = { label: "موقع المدرسة", address: "الرياض", lat: 24.74, lng: 46.82 };
const homeLocation: LocationPoint = { label: "بيت عبدالله", address: "النسيم شارع عبدالله بن عمر", lat: 24.737, lng: 46.834 };
const seededData: MasariData = {
  source: "cached",
  school: { name: "مدرسة أووك ورد العالمية", city: "الرياض", contactName: "شريفه", phone: "0543840340", location: schoolLocation },
  vehicle: { number: "1", plate: "أ أ ب 2223", capacity: 20 },
  driver: { name: "أحمد عسيري", email: "Hipf.20132044@gmail.com" },
  route: {
    name: "مسار 1",
    scheduledTime: "06:30",
    estimatedMinutes: 45,
    stops: [
      { label: "الروضة", time: "06:30", lat: 24.743, lng: 46.768 },
      { label: "النهضة", time: "06:45", lat: 24.781, lng: 46.815 },
      { label: "النسيم - شارع عبدالله بن عمر", time: "07:00", lat: homeLocation.lat, lng: homeLocation.lng, studentName: "عبدالله" },
      { label: "مدرسة أووك ورد العالمية", time: "07:15", lat: schoolLocation.lat, lng: schoolLocation.lng },
    ],
  },
  student: { name: "عبدالله", grade: "Kg3", address: "النسيم شارع عبدالله بن عمر", status: "جاهز للصعود", location: homeLocation },
  parent: { name: "تركي", email: "dx.0707@hotmail.com", phone: "0580171222" },
  ride: { date: "اليوم", status: "scheduled", studentStatus: "scheduled" },
};
const defaultExtraDrivers: DriverRow[] = [
  { name: "أحمد عسيري", phone: "—", email: "Hipf.20132044@gmail.com", plate: "أ أ ب 2223", status: "معتمد", capacity: 20, saved: true },
];
const defaultStudentRows: StudentRow[] = [
  { name: "عبدالله", grade: "Kg3", parentName: "تركي", parentPhone: "0580171222", parentEmail: "dx.0707@hotmail.com", address: "النسيم شارع عبدالله بن عمر", status: "مفعل", saved: true },
];
const defaultRouteRows: RouteRow[] = [
  { name: "مسار 1", direction: "إلى المدرسة", scheduledTime: "06:30", stops: "الروضة ← النهضة ← النسيم - شارع عبدالله بن عمر", status: "نشط", saved: true },
];
const defaultFeedbackRows: FeedbackItem[] = [
  { id: "seed-feedback-1", author: "تركي", role: "parent", rating: 5, category: "تقييم الخدمة", message: "الرحلة واضحة في المتابعة، ونحتاج إشعار أسرع عند اقتراب الباص.", status: "قيد المتابعة", createdAt: new Date().toISOString(), saved: true },
];

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

async function loadMasariData(): Promise<MasariData> {
  const next: MasariData = structuredClone(seededData);
  const { data: schools } = await supabase
    .from("schools")
    .select("id,name,city,contact_name,phone,address,latitude,longitude")
    .eq("name", "مدرسة أووك ورد العالمية")
    .limit(1);
  const school = schools?.[0];
  if (!school) return next;

  next.source = "supabase";
  next.school = {
    id: school.id,
    name: school.name ?? next.school.name,
    city: school.city ?? next.school.city,
    contactName: school.contact_name ?? next.school.contactName,
    phone: school.phone ?? next.school.phone,
    location: makeLocation("موقع المدرسة", school.address ?? next.school.city, school.latitude, school.longitude, next.school.location),
  };

  const { data: routes } = await supabase
    .from("routes")
    .select("id,name,scheduled_time,estimated_duration_minutes,driver_id")
    .eq("school_id", school.id)
    .eq("name", "مسار 1")
    .limit(1);
  const route = routes?.[0];
  if (route) {
    next.route.name = route.name ?? next.route.name;
    next.route.scheduledTime = formatTime(route.scheduled_time) || next.route.scheduledTime;
    next.route.estimatedMinutes = route.estimated_duration_minutes ?? next.route.estimatedMinutes;

    const { data: stops } = await supabase
      .from("route_stops")
      .select("label,scheduled_time,stop_order,student_id,latitude,longitude")
      .eq("route_id", route.id)
      .order("stop_order");
    if (stops?.length) {
      next.route.stops = stops.map((stop) => ({
        label: stop.label ?? "نقطة توقف",
        time: formatTime(stop.scheduled_time),
        lat: toNumber(stop.latitude, next.student.location.lat),
        lng: toNumber(stop.longitude, next.student.location.lng),
        studentName: null,
      }));
    }

    const { data: rides } = await supabase
      .from("rides")
      .select("id,ride_date,status")
      .eq("route_id", route.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (rides?.[0]) next.ride = { ...next.ride, date: rides[0].ride_date ?? next.ride.date, status: rides[0].status ?? next.ride.status };
  }

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("plate_number,capacity,notes")
    .eq("plate_number", "أ أ ب 2223")
    .limit(1);
  if (vehicles?.[0]) {
    next.vehicle = {
      number: "1",
      plate: vehicles[0].plate_number ?? next.vehicle.plate,
      capacity: vehicles[0].capacity ?? next.vehicle.capacity,
    };
  }

  const { data: studentsData } = await supabase
    .from("students")
    .select("full_name,grade,home_address,home_label,home_latitude,home_longitude,service_status,pickup_contact_name,pickup_contact_phone")
    .eq("school_id", school.id)
    .eq("full_name", "عبدالله")
    .limit(1);
  if (studentsData?.[0]) {
    next.student = {
      name: studentsData[0].full_name ?? next.student.name,
      grade: studentsData[0].grade ?? next.student.grade,
      address: studentsData[0].home_address ?? next.student.address,
      status: statusLabel(studentsData[0].service_status),
      location: makeLocation(studentsData[0].home_label ?? "موقع البيت", studentsData[0].home_address ?? next.student.address, studentsData[0].home_latitude, studentsData[0].home_longitude, next.student.location),
    };
    next.parent = {
      ...next.parent,
      name: studentsData[0].pickup_contact_name ?? next.parent.name,
      phone: studentsData[0].pickup_contact_phone ?? next.parent.phone,
    };
  }

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
async function resolveUserAccess(session: Session): Promise<{ role: Role | null; name: string; email: string }> {
  const email = session.user.email ?? "";
  await supabase.rpc("claim_my_invites");
  const { data, error } = await supabase.rpc("my_access");
  const access = data as MyAccess | null;
  const name = access?.full_name || email.split("@")[0] || "مستخدم";
  if (error || !access || access.status !== "active") return { role: null, name, email };
  let role: Role | null = null;
  if (access.platform_roles.some((r) => r === "super_admin" || r === "executive")) role = "executive";
  else if (access.schools.some((m) => m.status === "active" && m.school_status === "active")) role = "school";
  else if (access.driver?.status === "active") role = "driver";
  else if (access.guardian.some((g) => g.status === "active")) role = "parent";
  return { role, name, email };
}

async function loadDriverRows(): Promise<DriverRow[]> {
  const rows: DriverRow[] = [...defaultExtraDrivers];
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
  const rows: StudentRow[] = [...defaultStudentRows];
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
  if (!routes?.length) return defaultRouteRows;
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
    <div className="welcome"><div><p className="eyebrow">{data.school.city} · {data.school.contactName}</p><h1>{data.school.name}</h1><p>هذه حالة أول تشغيل حقيقي للنظام اليوم.</p></div><Button className="primary-action"><Plus /> إضافة مدرسة</Button></div>
    <section className="stats-grid">
      <Stat icon={GraduationCap} label="الطلاب المسجلون" value="1" detail={`${data.student.name} · ${data.student.grade}`} accent="blue" />
      <Stat icon={BusFront} label="الباصات النشطة" value="1" detail={`${data.vehicle.plate} · ${data.vehicle.capacity} مقعدًا`} accent="teal" />
      <Stat icon={Route} label="المسارات" value="1" detail={`${data.route.name} · ${data.route.stops.length} توقفات`} accent="purple" />
      <Stat icon={CircleDollarSign} label="الاشتراكات" value="1" detail="اشتراك شهري قيد الإعداد" accent="amber" />
    </section>
    <section className="main-grid"><LiveRoute data={data} simulation={simulation} driverGps={driverGps} /><article className="panel operations">
      <div className="panel-head"><div><p className="eyebrow">الآن</p><h2>حالة التشغيل</h2></div><Activity className="title-icon" /></div>
      <div className="operation-ring"><span><strong>{simulation.active ? 1 : 0}</strong><small>{simulation.active ? "رحلة جارية" : "رحلة مجدولة"}</small></span></div>
      <div className="operation-list"><div><span className="dot green"/><p>محطات معتمدة</p><strong>{simulation.approvedStops.length}</strong></div><div><span className="dot amber"/><p>المحطة الحالية</p><strong>{simulation.currentStopIndex + 1}</strong></div><div><span className="dot red"/><p>بيانات ناقصة</p><strong>رخصة</strong></div></div>
    </article></section>
    <section className="lower-grid">
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">آخر 7 أيام</p><h2>الالتزام بالمواعيد</h2></div><strong className="metric">96.4%</strong></div><div className="bars">{[82,91,88,96,94,98,96].map((h,i)=><div key={i}><span style={{height:h+"%"}}/><small>{["أحد","اثنين","ثلاثاء","أربعاء","خميس","أحد","اليوم"][i]}</small></div>)}</div></article>
      <article className="panel alerts"><div className="panel-head"><div><p className="eyebrow">تحتاج انتباهك</p><h2>التنبيهات</h2></div><Button variant="ghost" size="sm">عرض الكل</Button></div>
        <div className="alert-row"><span className="alert-icon amber"><Clock3 /></span><div><strong>رحلة اليوم لم تبدأ بعد</strong><p>{data.route.name} · موعد البداية {data.route.scheduledTime}</p></div><small>اليوم</small></div>
        <div className="alert-row"><span className="alert-icon blue"><WalletCards /></span><div><strong>اشتراك {data.student.name}</strong><p>تم إنشاؤه كاشتراك شهري قيد الإعداد</p></div><small>اليوم</small></div>
        <div className="alert-row"><span className="alert-icon red"><AlertTriangle /></span><div><strong>استكمال بيانات السائق</strong><p>{data.driver.name} · بيانات الرخصة تحتاج إدخال نهائي</p></div><small>مطلوب</small></div>
      </article>
    </section>
  </>;
}
function DriverDashboard({ data, simulation, tripSaveStatus, driverGps, gpsStatus, onStart, onEnd, onApproveStop, onRefreshGps, onReportIssue }: { data: MasariData; simulation: SimulationState; tripSaveStatus: string; driverGps?: DriverGps | null; gpsStatus: string; onStart: () => void; onEnd: () => void; onApproveStop: () => void; onRefreshGps: () => void; onReportIssue: () => void }) {
  const currentStop = data.route.stops[simulation.currentStopIndex] ?? data.route.stops[0];
  const finished = simulation.approvedStops.length >= data.route.stops.length;
  const distanceToStop = driverGps && currentStop ? Math.round(distanceMeters(driverGps, currentStop)) : null;
  const allowedDistance = STOP_RADIUS_METERS + Math.min(driverGps?.accuracy ?? 0, 100);
  const withinStopRadius = distanceToStop !== null && distanceToStop <= allowedDistance;
  const canApprove = simulation.active && !finished && withinStopRadius;
  const approveLabel = finished ? "تم اعتماد كل المحطات" : !driverGps ? "فعّل GPS لاعتماد المحطة" : !withinStopRadius ? `تبعد ${distanceToStop}م عن المحطة` : "اعتماد محطة الوصول";
  const students = [{ name: data.student.name, grade: data.student.grade, stop: data.student.address, status: studentStatusLabel[simulation.studentStatus] }];
  return <>
    <div className="welcome driver-welcome"><div><p className="eyebrow">مسارك اليوم</p><h1>الرحلة الصباحية — {data.route.name}</h1><p>{data.route.stops.length} محطات · طالب واحد · الباص {data.vehicle.number}</p></div><Button className={simulation.active ? "danger-action" : "primary-action"} onClick={simulation.active ? onEnd : onStart}>{simulation.active ? <><X/> إنهاء الرحلة</> : <><Navigation/> بدء الرحلة وتفعيل الموقع</>}</Button></div>
    {simulation.active && <div className={`trip-live-strip ${driverGps ? "" : "gps-missing"}`}><span/><strong>{driverGps ? "GPS فعّال الآن" : "الرحلة بدأت والموقع غير متاح"}</strong><p>{driverGps ? "اعتماد المحطة متاح داخل نطاق 250 متر فقط" : "اسمح للموقع من إعدادات المتصفح، ثم اضغط تحديث GPS"}</p></div>}
    {tripSaveStatus && <div className="save-strip trip-save"><Check/><span>{tripSaveStatus}</span></div>}
    <article className="panel gps-panel">
      <div><p className="eyebrow">GPS الجهاز</p><strong>{driverGps ? "تم التقاط موقع السائق" : "بانتظار السماح بالموقع"}</strong><span>{gpsStatus || "اضغط بدء الرحلة وسيطلب المتصفح إذن الموقع."}</span></div>
      {driverGps && <div className="gps-coords"><MapPin/><span>{driverGps.lat.toFixed(5)}, {driverGps.lng.toFixed(5)}</span><small>دقة {Math.round(driverGps.accuracy ?? 0)}م</small></div>}
      <Button variant="outline" onClick={onRefreshGps}><Navigation/> تحديث GPS الآن</Button>
    </article>
    <section className="driver-grid"><article className="panel stops">
      <div className="panel-head"><div><p className="eyebrow">{finished ? "اكتملت الرحلة" : "المحطة الحالية"}</p><h2>{finished ? data.school.name : currentStop?.label}</h2></div><div className="eta-pill">{finished ? "تم" : currentStop?.time}</div></div>
      <div className="stop-progress"><Progress value={(simulation.approvedStops.length / data.route.stops.length) * 100}/><span>{simulation.approvedStops.length} من {data.route.stops.length} محطات معتمدة</span></div>
      <div className="student-checklist">{students.map((student)=><div key={student.name} className={"check-row "+(simulation.studentStatus==="on_bus"||simulation.studentStatus==="arrived"?"checked":"")}><span className="student-avatar">{student.name.charAt(0)}</span><div><strong>{student.name}</strong><p>{student.grade} · {student.status}</p></div><span className="check-box">{(simulation.studentStatus==="on_bus"||simulation.studentStatus==="arrived") && <Check/>}</span></div>)}</div>
      {!finished && <p className={`geofence-status ${withinStopRadius ? "ready" : "blocked"}`}><MapPin/>{distanceToStop === null ? "لا يمكن الاعتماد دون موقع GPS فعلي" : withinStopRadius ? `داخل نطاق المحطة · ${distanceToStop} متر` : `اقترب حتى 250 متر من ${currentStop?.label}`}</p>}
      <Button className="wide-action" disabled={!canApprove} onClick={onApproveStop}><Check/> {approveLabel}</Button>
    </article><article className="panel compact-route"><div className="panel-head"><div><p className="eyebrow">تسلسل الرحلة</p><h2>نقاط التوقف</h2></div></div>
      {data.route.stops.map((stop,i)=><div className={"timeline-row "+(simulation.approvedStops.includes(i)?"passed":i===simulation.currentStopIndex?"current":"")} key={stop.label}><span>{simulation.approvedStops.includes(i)?<Check/>:i+1}</span><div><strong>{stop.label}</strong><p>{stop.time}</p></div></div>)}
      <Button variant="outline" className="report-btn" disabled={!simulation.active} onClick={onReportIssue}><AlertTriangle/> إرسال بلاغ طارئ</Button>
    </article></section>
  </>;
}
function FeedbackPanel({ data, feedbackRows, authMode, onSubmit }: { data: MasariData; feedbackRows: FeedbackItem[]; authMode: AuthMode; onSubmit: (feedback: Omit<FeedbackItem, "id" | "createdAt" | "saved">) => Promise<void> }) {
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
    setStatus(authMode === "authenticated" ? "تم إرسال الملاحظة للإدارة." : "تمت إضافة الملاحظة للتجربة. الحفظ الدائم يحتاج تسجيل دخول فعلي.");
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

function ParentDashboard({ data, simulation, driverGps, tripEvents, feedbackRows, authMode, onSubmitFeedback }: { data: MasariData; simulation: SimulationState; driverGps?: DriverGps | null; tripEvents: TripEventRow[]; feedbackRows: FeedbackItem[]; authMode: AuthMode; onSubmitFeedback: (feedback: Omit<FeedbackItem, "id" | "createdAt" | "saved">) => Promise<void> }) {
  const currentStop = data.route.stops[simulation.currentStopIndex] ?? data.route.stops[0];
  const events = tripEvents.length ? tripEvents : [
    { eventType: "note", note: simulation.active ? "تم تفعيل تتبع الباص" : `تمت جدولة رحلة ${data.student.name}`, createdAt: new Date().toISOString() },
    { eventType: "note", note: `${studentStatusLabel[simulation.studentStatus]} · ${simulation.approvedStops.length} من ${data.route.stops.length} محطات معتمدة`, createdAt: new Date().toISOString() },
  ];
  return <>
    <div className="welcome"><div><p className="eyebrow">صباح الخير يا {data.parent.name}</p><h1>{data.student.name}: {studentStatusLabel[simulation.studentStatus]}</h1><p>{simulation.active ? `الباص عند ${currentStop?.label}` : `${data.route.name} · السائق ${data.driver.name} · الباص ${data.vehicle.number}`}</p></div><Badge className="safe-badge"><ShieldCheck/> الرحلة آمنة</Badge></div>
    <LiveRoute data={data} simulation={simulation} driverGps={driverGps} parent />
    <section className="lower-grid parent-lower"><article className="panel child-card"><div className="student-avatar big">{data.student.name.charAt(0)}</div><div><p className="eyebrow">الطالب</p><h2>{data.student.name}</h2><p>{data.student.grade} · {data.school.name}</p></div><Badge className="onbus">{studentStatusLabel[simulation.studentStatus]}</Badge></article>
      <article className="panel"><div className="panel-head"><div><p className="eyebrow">اليوم</p><h2>تحديثات الرحلة</h2></div><Bell className="title-icon"/></div>{events.slice(0,4).map((event, index)=><div className={`event ${event.eventType === "emergency" ? "emergency-event" : ""}`} key={event.id ?? `${event.eventType}-${index}`}><span className={index === 0 ? "done" : ""}>{event.eventType === "emergency" ? <AlertTriangle/> : event.eventType === "pickup" || event.eventType === "dropoff" ? <Check/> : <Navigation/>}</span><div><strong>{eventTypeLabel(event.eventType)}</strong><p>{event.note || currentStop?.label} · {formatEventTime(event.createdAt)}</p></div></div>)}</article>
    </section>
    <FeedbackPanel data={data} feedbackRows={feedbackRows} authMode={authMode} onSubmit={onSubmitFeedback}/>
  </>;
}
function AddDriverPanel({ onAdd, authMode }: { onAdd: (driver: DriverForm) => Promise<void>; authMode: AuthMode }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", plate: "", status: "قيد المراجعة" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdd = form.name.trim() && form.phone.trim() && form.plate.trim();
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setBusy(true); setMessage("");
    await onAdd(form);
    setBusy(false);
    setMessage(authMode === "authenticated" ? "تم حفظ طلب السائق وربطه بالمدرسة." : "تمت إضافته للعرض التجريبي فقط. سجّل دخول فعلي للحفظ.");
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

function AddStudentPanel({ onAdd, authMode }: { onAdd: (student: StudentForm) => Promise<void>; authMode: AuthMode }) {
  const [form, setForm] = useState({ name: "", grade: "", parentName: "", parentPhone: "", parentEmail: "", address: "", status: "قيد المراجعة" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdd = form.name.trim() && form.grade.trim() && form.parentPhone.trim() && form.address.trim();
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setBusy(true); setMessage("");
    await onAdd(form);
    setBusy(false);
    setMessage(authMode === "authenticated" ? "تم حفظ طلب الطالب وربطه بالمدرسة." : "تمت إضافته للعرض التجريبي فقط. سجّل دخول فعلي للحفظ.");
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

function AddRoutePanel({ onAdd, authMode }: { onAdd: (route: RouteForm) => Promise<void>; authMode: AuthMode }) {
  const [form, setForm] = useState<RouteForm>({ name: "", direction: "to_school", scheduledTime: "06:30", stopsText: "", status: "قيد الإعداد" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const canAdd = form.name.trim() && form.scheduledTime.trim() && form.stopsText.split("\n").filter((line)=>line.trim()).length >= 2;
  const update = (key: keyof RouteForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setBusy(true); setMessage("");
    await onAdd(form);
    setBusy(false);
    setMessage(authMode === "authenticated" ? "تم حفظ المسار ومحطاته." : "تمت إضافته للعرض التجريبي فقط. سجّل دخول فعلي للحفظ.");
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
  const events = tripEvents.length ? tripEvents : data.route.stops.map((stop, index)=>({
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
  const rows = view==="schools" ? [[data.school.name, `${data.school.city} · ${data.school.contactName}`, "نشط", "اليوم"]]
    : view==="fleet" ? extraDrivers.map((driver)=>[`${driver.name} · ${driver.plate}`, `${driver.email || driver.phone} · ${driver.capacity ?? data.vehicle.capacity} مقعدًا`, driver.status, driver.saved ? "محفوظ" : "محلي"])
    : view==="routes" ? routeRows.map((route)=>[route.name, `${route.direction} · ${route.stops}`, route.status, route.saved ? route.scheduledTime : "محلي"])
    : view==="trips" ? (tripEvents.length ? tripEvents.map((event)=>[eventTypeLabel(event.eventType), event.note || `${data.student.name} · ${data.student.address}`, event.eventType === "pickup" ? "حضور" : event.eventType === "dropoff" ? "انصراف" : event.eventType === "emergency" ? "طارئ" : "تحديث", formatEventTime(event.createdAt)]) : [[`رحلة ${data.route.name}`, `${data.student.name} · ${data.student.address}`, statusLabel(data.ride.status), data.ride.date]])
    : view==="finance" ? [[`اشتراك ${data.student.name}`, `${data.parent.name} · ${data.parent.phone}`, "قيد الإعداد", "اليوم"]]
    : view==="reports" ? feedbackRows.map((item)=>[`${item.category} · ${item.rating}/5`, `${item.author} · ${item.message}`, item.status, formatEventTime(item.createdAt)])
    : view==="audit" ? [["إدخال بيانات التشغيل الأولى", `بواسطة ${data.school.contactName}`, "موثق", "اليوم"]]
    : studentRows.map((student)=>[student.name, `${student.grade} · ${student.parentName || "ولي الأمر"} · ${student.address}`, student.status, student.saved ? "محفوظ" : "محلي"]);
  const canManage = role === "school" || role === "executive";
  return <><div className="welcome"><div><p className="eyebrow">إدارة النظام</p><h1>{c.title}</h1><p>{c.subtitle}</p></div><Button className="primary-action"><Plus/>{c.action}</Button></div>{view==="trips"&&<section className="trip-summary-grid"><article className="panel mini-metric"><span>أحداث اليوم</span><strong>{tripEvents.length || simulation.approvedStops.length}</strong></article><article className="panel mini-metric"><span>حالة الطالب</span><strong>{studentStatusLabel[simulation.studentStatus]}</strong></article><article className="panel mini-metric"><span>آخر تحديث</span><strong>{tripEvents[0] ? formatEventTime(tripEvents[0].createdAt) : "—"}</strong></article></section>}{view==="fleet"&&canManage&&<AddDriverPanel onAdd={onAddDriver} authMode={authMode}/>} {view==="students"&&canManage&&<AddStudentPanel onAdd={onAddStudent} authMode={authMode}/>} {view==="routes"&&canManage&&<AddRoutePanel onAdd={onAddRoute} authMode={authMode}/>}<article className="panel data-panel"><div className="data-tools"><div className="search-box"><Search/><input aria-label="بحث" placeholder="ابحث بالاسم أو الرقم…"/></div><Button variant="outline">الحالة: الكل</Button></div><div className="data-table"><div className="table-head"><span>الاسم / البيان</span><span>التفاصيل</span><span>الحالة</span><span>آخر تحديث</span></div>{rows.map((row,i)=><div className="table-row" key={i}><span><span className="row-icon"><Icon/></span><strong>{row[0]}</strong></span><span>{row[1]}</span><span><Badge className={"status-badge tone-"+(i%3)}>{row[2]}</Badge></span><span>{row[3]}</span></div>)}</div></article></>;
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
  return <div className="login-backdrop"><div className="login-card"><button className="close-login" onClick={onClose}><X/></button><div className="brand-mark large"><BusFront/></div><p className="eyebrow">مرحبًا بك</p><h2>تسجيل الدخول إلى مساري</h2><p>استخدم الحساب المسجل لدى المدرسة أو شركة النقل.</p><label>البريد الإلكتروني<input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="name@example.com"/></label><label>كلمة المرور<input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder="••••••••"/></label>{message&&<p className="login-message">{message}</p>}<Button className="wide-action" onClick={login} disabled={busy||!email||!password}>{busy?"جارٍ الدخول…":"تسجيل الدخول"}</Button><button className="text-link">نسيت كلمة المرور؟</button></div></div>;
}
function AuthPage({ onEnter, onAuthenticated }: { onEnter: (role: Role) => void; onAuthenticated: (session: Session) => Promise<void> }) {
  const [selectedRole, setSelectedRole] = useState<Role>("parent");
  const [mode, setMode] = useState<"login" | "signup">("login");
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
    <section className="auth-hero"><div className="brand-mark large"><BusFront/></div><p className="eyebrow">مساري</p><h1>تسجيل الدخول وإدارة النقل المدرسي</h1><p>اختر دورك للدخول إلى الواجهة المناسبة. هذه النسخة تدعم تجربة التشغيل، وإضافة السائق، وبرج المراقبة.</p></section>
    <section className="auth-shell">
      <div className="auth-tabs"><button className={mode==="login"?"active":""} onClick={()=>setMode("login")}>تسجيل الدخول</button><button className={mode==="signup"?"active":""} onClick={()=>setMode("signup")}>تسجيل جديد</button></div>
      <div className="role-cards">{roleOptions.map((item)=><button key={item.role} className={selectedRole===item.role?"active":""} onClick={()=>setSelectedRole(item.role)}><item.icon/><strong>{item.title}</strong><span>{item.desc}</span></button>)}</div>
      <div className="auth-form-card"><div className="auth-form-head"><SelectedIcon/><div><p className="eyebrow">{mode==="login"?"دخول":"إنشاء حساب"}</p><h2>{roleNames[selectedRole]}</h2></div></div>
        <label>البريد الإلكتروني<input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" placeholder="name@example.com"/></label>
        <label>كلمة المرور<input value={password} onChange={(e)=>setPassword(e.target.value)} type="password" placeholder="••••••••"/></label>
        {mode==="signup"&&<label>اسم الجهة / المستخدم<input value={name} onChange={(e)=>setName(e.target.value)} placeholder={selectedRole==="school"?"اسم المدرسة":"الاسم الكامل"}/></label>}
        {message&&<p className="auth-message">{message}</p>}
        <Button className="wide-action" onClick={submitAuth} disabled={busy || !email.trim() || password.length < 6}>{busy ? "جارٍ التحقق…" : mode==="login" ? "تسجيل دخول حقيقي" : "إنشاء حساب"}</Button>
        <button className="demo-button" onClick={()=>onEnter(selectedRole)}>دخول تجريبي مؤقت</button>
        <p className="auth-note">الدخول الحقيقي يستخدم Supabase Auth. الدخول التجريبي مخصص للعرض السريع فقط.</p>
      </div>
    </section>
  </main>;
}
export default function Home() {
  const [entered,setEntered]=useState(false); const [role,setRole]=useState<Role>("executive"); const [view,setView]=useState<View>("dashboard"); const [login,setLogin]=useState(false); const [online,setOnline]=useState(()=>typeof navigator === "undefined" ? true : navigator.onLine); const [data,setData]=useState<MasariData>(seededData); const [simulation,setSimulation]=useState<SimulationState>(initialSimulation); const [extraDrivers,setExtraDrivers]=useState<DriverRow[]>(defaultExtraDrivers); const [studentRows,setStudentRows]=useState<StudentRow[]>(defaultStudentRows); const [routeRows,setRouteRows]=useState<RouteRow[]>(defaultRouteRows); const [feedbackRows,setFeedbackRows]=useState<FeedbackItem[]>(defaultFeedbackRows); const [saveStatus,setSaveStatus]=useState(""); const [tripSaveStatus,setTripSaveStatus]=useState(""); const [gpsStatus,setGpsStatus]=useState(""); const [driverGps,setDriverGps]=useState<DriverGps | null>(null); const [tripEvents,setTripEvents]=useState<TripEventRow[]>([]); const [notificationsOpen,setNotificationsOpen]=useState(false); const [activeTripContext,setActiveTripContext]=useState<TripContext | null>(null); const [authMode,setAuthMode]=useState<AuthMode>("demo"); const [accountName,setAccountName]=useState("");
  const gpsWatchRef = useRef<number | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const eventsChannelRef = useRef<RealtimeChannel | null>(null);
  useEffect(()=>{const a=()=>setOnline(true),b=()=>setOnline(false);window.addEventListener("online",a);window.addEventListener("offline",b);if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});return()=>{window.removeEventListener("online",a);window.removeEventListener("offline",b)}},[]);
  useEffect(()=>{let alive=true;const refresh=()=>loadMasariData().then((next)=>{if(alive)setData(next)}).catch(()=>{});refresh();const {data:{subscription}}=supabase.auth.onAuthStateChange(()=>refresh());return()=>{alive=false;subscription.unsubscribe()}},[]);
  useEffect(()=>{let alive=true;loadDriverRows().then((rows)=>{if(alive)setExtraDrivers(rows)}).catch(()=>{});return()=>{alive=false}},[authMode]);
  useEffect(()=>{let alive=true;loadStudentRows().then((rows)=>{if(alive)setStudentRows(rows)}).catch(()=>{});return()=>{alive=false}},[authMode]);
  useEffect(()=>{let alive=true;loadRouteRows().then((rows)=>{if(alive)setRouteRows(rows)}).catch(()=>{});return()=>{alive=false}},[authMode]);
  useEffect(()=>{let alive=true;supabase.auth.getSession().then(async({data:sessionData})=>{if(!alive||!sessionData.session)return;const access=await resolveUserAccess(sessionData.session);if(!alive)return;if(!access.role){await supabase.auth.signOut();return}setRole(access.role);setAccountName(access.name);setAuthMode("authenticated");setEntered(true)}).catch(()=>{});return()=>{alive=false}},[]);
  useEffect(()=>()=>{if(gpsWatchRef.current!==null) navigator.geolocation.clearWatch(gpsWatchRef.current); if(realtimeChannelRef.current) void supabase.removeChannel(realtimeChannelRef.current); if(eventsChannelRef.current) void supabase.removeChannel(eventsChannelRef.current)},[]);
  const nav=useMemo(()=>navByRole[role],[role]); const notifications=useMemo(()=>buildNotifications(data, simulation, driverGps, tripEvents, feedbackRows),[data, simulation, driverGps, tripEvents, feedbackRows]); const switchRole=(r:Role)=>{setRole(r);setView("dashboard")};
  const enterAs=(nextRole: Role)=>{setRole(nextRole);setAccountName("");setAuthMode("demo");setView("dashboard");setEntered(true)};
  const enterAuthenticated=async(session: Session)=>{const access=await resolveUserAccess(session);if(!access.role)throw new Error("ACCOUNT_PENDING");setRole(access.role);setAccountName(access.name);setAuthMode("authenticated");setView("dashboard");setEntered(true)};
  const stopGpsTracking=()=>{if(gpsWatchRef.current!==null){navigator.geolocation.clearWatch(gpsWatchRef.current);gpsWatchRef.current=null}setGpsStatus("تم إيقاف تتبع GPS.")};
  const stopRealtimeTracking=()=>{if(realtimeChannelRef.current){void supabase.removeChannel(realtimeChannelRef.current);realtimeChannelRef.current=null}};
  const stopEventsRealtime=()=>{if(eventsChannelRef.current){void supabase.removeChannel(eventsChannelRef.current);eventsChannelRef.current=null}};
  const signOut=async()=>{if(authMode==="authenticated") await supabase.auth.signOut();stopGpsTracking();stopRealtimeTracking();stopEventsRealtime();setAuthMode("demo");setAccountName("");setEntered(false);setView("dashboard");setSimulation(initialSimulation);setActiveTripContext(null);setTripSaveStatus("");setDriverGps(null);setTripEvents([]);setFeedbackRows(defaultFeedbackRows);setNotificationsOpen(false)};
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
      vehicle_capacity: data.vehicle.capacity,
      status: "pending",
    });
    if (!error) {
      const rows = await loadDriverRows().catch(()=>null);
      if (rows) setExtraDrivers(rows);
    }
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
    if (!error) {
      const rows = await loadStudentRows().catch(()=>null);
      if (rows) setStudentRows(rows);
    }
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
      if (kind === "school") await supabase.from("schools").update({ address: point.address, latitude: point.lat, longitude: point.lng }).eq("name", "مدرسة أووك ورد العالمية");
      else await supabase.from("students").update({ home_address: point.address, home_label: point.label, home_latitude: point.lat, home_longitude: point.lng }).eq("full_name", "عبدالله");
      setSaveStatus("تم حفظ الموقع وتحديث الخريطة.");
    } catch {
      setSaveStatus("تم تحديث الموقع على الشاشة، وسيحتاج الحفظ النهائي لتسجيل دخول فعلي.");
    }
    setTimeout(()=>setSaveStatus(""), 3800);
  };
  const showTripSaveStatus=(message: string)=>{setTripSaveStatus(message);setTimeout(()=>setTripSaveStatus(""), 5200)};
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
      .channel(`masari-driver-location-${tripId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "driver_locations", filter: `trip_id=eq.${tripId}` }, (payload) => {
        const row = payload.new as { latitude?: number | string; longitude?: number | string; created_at?: string | null };
        if (row.latitude != null && row.longitude != null) setSavedGpsPoint({ latitude: row.latitude, longitude: row.longitude, created_at: row.created_at });
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
  const loadLatestSavedGps=async()=>{
    if (authMode !== "authenticated") return;
    const { data: routeRowsData } = await supabase
      .from("routes")
      .select("id")
      .eq("name", data.route.name)
      .limit(1);
    const routeId = routeRowsData?.[0]?.id;
    if (!routeId) return;
    const { data: tripRows } = await supabase
      .from("trips")
      .select("id,status")
      .eq("route_id", routeId)
      .order("created_at", { ascending: false })
      .limit(1);
    const trip = tripRows?.[0];
    if (!trip?.id) return;
    subscribeToTripLocations(trip.id);
    subscribeToTripEvents(trip.id);
    if (trip.status === "in_progress") {
      setSimulation((current)=>current.active ? current : { ...current, active: true, studentStatus: current.studentStatus === "waiting" ? "approaching" : current.studentStatus });
    }
    const { data: locations } = await supabase
      .from("driver_locations")
      .select("latitude,longitude,created_at")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (locations?.[0]) setSavedGpsPoint(locations[0]);
    await loadTripEvents(trip.id);
  };
  useEffect(()=>{
    if (!entered || authMode !== "authenticated") return;
    let alive = true;
    const refresh = async()=>{if(alive) await loadLatestSavedGps().catch(()=>{})};
    void refresh();
    const interval = window.setInterval(()=>void refresh(), 15000);
    return ()=>{alive=false;window.clearInterval(interval);stopRealtimeTracking();stopEventsRealtime()};
    // The route name is the subscription identity; helper functions intentionally read the latest component state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered, authMode, data.route.name]);
  const getTripContext=async(): Promise<TripContext | null>=>{
    if (authMode !== "authenticated") {
      showTripSaveStatus("تم التحديث كتجربة مباشرة. الحفظ في قاعدة البيانات يحتاج تسجيل دخول فعلي.");
      return null;
    }
    const today = new Date().toISOString().slice(0, 10);
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    const { data: routeRowsData } = await supabase
      .from("routes")
      .select("id,driver_id,school_id")
      .eq("name", data.route.name)
      .limit(1);
    const routeRow = routeRowsData?.[0];
    if (!routeRow?.id) {
      showTripSaveStatus("تعذر العثور على المسار في قاعدة البيانات.");
      return null;
    }
    const { data: driverRowsData } = userId
      ? await supabase.from("drivers").select("id").eq("user_id", userId).limit(1)
      : { data: null };
    const driverId = driverRowsData?.[0]?.id ?? routeRow.driver_id;
    if (!driverId) {
      showTripSaveStatus("المسار لا يحتوي على سائق مرتبط بعد.");
      return null;
    }
    const { data: studentRowsData } = await supabase
      .from("students")
      .select("id")
      .eq("school_id", routeRow.school_id)
      .eq("full_name", data.student.name)
      .limit(1);
    const studentId = studentRowsData?.[0]?.id ?? null;
    const todayTrips = await supabase
      .from("trips")
      .select("id,driver_id,route_id,status")
      .eq("route_id", routeRow.id)
      .eq("trip_date", today)
      .order("created_at", { ascending: false })
      .limit(1);
    let trip = todayTrips.data?.[0];
    if (!trip) {
      const latestTrips = await supabase
        .from("trips")
        .select("id,driver_id,route_id,status")
        .eq("route_id", routeRow.id)
        .in("status", ["scheduled", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(1);
      trip = latestTrips.data?.[0];
    }
    if (!trip) {
      const inserted = await supabase
        .from("trips")
        .insert({ route_id: routeRow.id, driver_id: driverId, trip_date: today, status: "scheduled", notes: "تم إنشاؤها من واجهة مساري" })
        .select("id,driver_id,route_id,status")
        .single();
      trip = inserted.data ?? undefined;
    }
    if (!trip?.id) {
      showTripSaveStatus("تم تشغيل الرحلة على الشاشة، لكن إنشاء رحلة اليوم يحتاج صلاحية المدرسة.");
      return null;
    }
    const started = await supabase
      .from("trips")
      .update({ status: "in_progress", started_at: new Date().toISOString(), notes: "بدأت من تطبيق السائق" })
      .eq("id", trip.id);
    if (started.error) {
      showTripSaveStatus("تم تشغيل الرحلة على الشاشة، لكن حسابك لا يملك صلاحية بدء هذه الرحلة.");
      return null;
    }
    return { tripId: trip.id, driverId, routeId: routeRow.id, studentId };
  };
  const persistGpsLocation=async(point: DriverGps, context?: TripContext | null)=>{
    const tripContext = context ?? activeTripContext;
    if (!tripContext) return;
    try {
      await supabase.from("driver_locations").insert({
        driver_id: tripContext.driverId,
        trip_id: tripContext.tripId,
        latitude: point.lat,
        longitude: point.lng,
        speed: null,
        heading: null,
      }).throwOnError();
      setGpsStatus("تم حفظ نقطة GPS في Supabase.");
    } catch {
      setGpsStatus("GPS يعمل على الشاشة، لكن حفظ النقطة يحتاج حساب السائق المصرح.");
    }
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
  const recordDriverPoint=async(stopIndex: number, context?: TripContext | null, eventType: "pickup" | "dropoff" | "note" = "note", note = "تم اعتماد محطة الوصول", pointOverride?: DriverGps | null)=>{
    const stop = data.route.stops[stopIndex] ?? data.route.stops[0];
    const point = pointOverride ?? driverGps ?? (stop ? { label: stop.label, address: stop.label, lat: stop.lat, lng: stop.lng } : null);
    if (!point) return false;
    const tripContext = context ?? activeTripContext ?? await getTripContext();
    if (!tripContext) return false;
    try {
      await supabase.from("driver_locations").insert({
        driver_id: tripContext.driverId,
        trip_id: tripContext.tripId,
        latitude: point.lat,
        longitude: point.lng,
        speed: 0,
        heading: 0,
      }).throwOnError();
      await supabase.from("trip_events").insert({
        trip_id: tripContext.tripId,
        student_id: eventType === "pickup" || eventType === "dropoff" ? tripContext.studentId : null,
        event_type: eventType,
        latitude: point.lat,
        longitude: point.lng,
        note: `${note}: ${stop?.label ?? point.label}`,
      }).throwOnError();
      setTripEvents((current)=>[{
        eventType,
        note: `${note}: ${stop?.label ?? point.label}`,
        createdAt: new Date().toISOString(),
      }, ...current].slice(0, 10));
      showTripSaveStatus("تم حفظ موقع السائق وحدث المحطة في Supabase.");
      return true;
    } catch {
      showTripSaveStatus("تحركت الخريطة، لكن حفظ الموقع يحتاج حساب السائق المرتبط بهذه الرحلة.");
      return false;
    }
  };
  const startTrip=()=>{
    setSimulation({ active: true, currentStopIndex: 0, approvedStops: [], studentStatus: "approaching" });
    void (async()=>{
      const context = await getTripContext();
      setActiveTripContext(context);
      startGpsTracking(context);
    })();
  };
  const endTrip=()=>{
    setSimulation((current)=>({ ...current, active: false, studentStatus: current.studentStatus === "arrived" ? "arrived" : current.studentStatus }));
    stopGpsTracking();
    void (async()=>{
      const context = activeTripContext ?? await getTripContext();
      if (!context) return;
      try {
        await supabase.from("trips").update({ status: "completed", completed_at: new Date().toISOString(), notes: "انتهت من تطبيق السائق" }).eq("id", context.tripId).throwOnError();
        await supabase.from("trip_events").insert({
          trip_id: context.tripId,
          student_id: context.studentId ?? null,
          event_type: "dropoff",
          latitude: driverGps?.lat ?? null,
          longitude: driverGps?.lng ?? null,
          note: driverGps ? `تم إنهاء الرحلة عند ${data.school.name}` : `تم إنهاء الرحلة دون توفر GPS`,
        }).throwOnError();
        setTripEvents((current)=>[{
          eventType: "dropoff",
          note: `تم إنهاء الرحلة عند ${data.school.name}`,
          createdAt: new Date().toISOString(),
        }, ...current].slice(0, 10));
        showTripSaveStatus("تم إنهاء الرحلة وحفظ حدث الوصول.");
        setActiveTripContext(null);
      } catch {
        showTripSaveStatus("تم إنهاء الرحلة على الشاشة، لكن الحفظ النهائي يحتاج صلاحية الرحلة.");
      }
    })();
  };
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
    const allowedDistance=STOP_RADIUS_METERS+Math.min(driverGps.accuracy??0,100);
    if(distance>allowedDistance){showTripSaveStatus(`أنت تبعد ${distance} متر عن ${stop.label}. اقترب حتى 250 متر.`);return}
    const isSchoolStop=distanceMeters(stop,data.school.location)<=120;
    const isStudentStop=Boolean(stop.studentName)||stop.label.includes("النسيم");
    const eventType=isSchoolStop?"dropoff":isStudentStop?"pickup":"note";
    const note=isSchoolStop?"تم اعتماد وصول الطالب إلى المدرسة":isStudentStop?"تم اعتماد صعود الطالب":"تم اعتماد وصول الباص للمحطة";
    if(authMode==="authenticated"){
      const saved=await recordDriverPoint(index,activeTripContext,eventType,note,driverGps);
      if(!saved)return;
    }else{
      showTripSaveStatus(`تم اعتماد ${stop.label} عبر GPS من مسافة ${distance} متر. الحفظ الدائم يحتاج تسجيل دخول فعلي.`);
    }
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
    showTripSaveStatus(authMode === "authenticated" ? "تم إرسال البلاغ لبرج المراقبة." : "تم إرسال البلاغ في التجربة. الحفظ الدائم يحتاج تسجيل دخول فعلي.");
    void (async()=>{
      if (authMode !== "authenticated") return;
      const context = activeTripContext ?? await getTripContext();
      if (!context) return;
      try {
        const { data: savedEvent } = await supabase.from("trip_events").insert({
          trip_id: context.tripId,
          student_id: context.studentId ?? null,
          event_type: "emergency",
          latitude: point.lat,
          longitude: point.lng,
          note,
        }).select("id,event_type,note,created_at").single();
        if (savedEvent) {
          const normalized = normalizeTripEvent(savedEvent);
          setTripEvents((current)=>[normalized, ...current.filter((event)=>event.id !== localId && event.id !== normalized.id)].slice(0, 10));
        }
        await supabase.from("driver_locations").insert({
          driver_id: context.driverId,
          trip_id: context.tripId,
          latitude: point.lat,
          longitude: point.lng,
          speed: 0,
          heading: 0,
        });
        showTripSaveStatus("تم حفظ البلاغ الطارئ وموقعه في Supabase.");
      } catch {
        showTripSaveStatus("ظهر البلاغ على الشاشة، لكن حفظه يحتاج صلاحية السائق المرتبط بالرحلة.");
      }
    })();
  };
  if(!entered) return <AuthPage onEnter={enterAs} onAuthenticated={enterAuthenticated}/>;
  return <div dir="rtl" className="masari-app">{!online&&<div className="offline-banner">أنت تعمل دون اتصال — نعرض آخر بيانات محفوظة</div>}<SidebarProvider style={{"--sidebar-width":"17.5rem"} as React.CSSProperties}>
    <Sidebar side="right" variant="sidebar" collapsible="offcanvas" className="masari-sidebar"><SidebarHeader className="sidebar-brand"><div className="brand-mark"><BusFront/></div><div><strong>مساري</strong><span>إدارة النقل المدرسي</span></div></SidebarHeader><SidebarContent><SidebarGroup><SidebarGroupContent><SidebarMenu>{nav.map(item=><SidebarMenuItem key={item.id}><SidebarMenuButton isActive={view===item.id} onClick={()=>setView(item.id)} tooltip={item.label}><item.icon/><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent><SidebarFooter className="sidebar-footer"><div className="support-card"><MessageSquareText/><strong>تحتاج مساعدة؟</strong><p>{data.school.contactName} · {data.school.phone}</p><button>تواصل معنا</button></div><div className="account-row"><span>{(accountName || data.school.contactName).charAt(0)}</span><div><strong>{accountName || (role==="parent"?data.parent.name:role==="driver"?data.driver.name:data.school.contactName)}</strong><p>{authMode==="authenticated" ? "حساب فعلي" : "وضع تجريبي"} · {roleNames[role]}</p></div><button onClick={()=>authMode==="authenticated"?void signOut():setLogin(true)}>{authMode==="authenticated"?"خروج":"دخول"}</button></div></SidebarFooter></Sidebar>
    <SidebarInset className="app-inset"><header className="topbar"><div className="mobile-logo"><SidebarTrigger><Menu/></SidebarTrigger><div className="brand-mark"><BusFront/></div><strong>مساري</strong></div><div className="top-actions"><Badge variant="outline">{authMode==="authenticated"?"جلسة فعلية":simulation.active?driverGps?"GPS مباشر":"GPS غير متاح":data.source==="supabase"?"متصل بقاعدة البيانات":"بيانات محفوظة"}</Badge><Select value={role} onValueChange={v=>switchRole(v as Role)} disabled={authMode==="authenticated"}><SelectTrigger className="role-select"><SelectValue/></SelectTrigger><SelectContent>{Object.entries(roleNames).map(([k,v])=><SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select><button className="text-link top-exit" onClick={()=>void signOut()}>خروج</button><div className="notification-wrap"><button className="icon-button" aria-label="الإشعارات" onClick={()=>setNotificationsOpen((open)=>!open)}><Bell/><span>{notifications.length}</span></button>{notificationsOpen&&<div className="notification-popover"><div className="notification-head"><strong>الإشعارات</strong><small>{notifications.length} تحديثات</small></div>{notifications.map((notification)=><div className="notification-item" key={notification.id}><span className={`notify-dot ${notification.tone}`}/><div><strong>{notification.title}</strong><p>{notification.body}</p></div><small>{notification.time}</small></div>)}</div>}</div></div></header><main className="content">{view==="dashboard" ? role==="driver" ? <DriverDashboard data={data} simulation={simulation} tripSaveStatus={tripSaveStatus} driverGps={driverGps} gpsStatus={gpsStatus} onStart={startTrip} onEnd={endTrip} onApproveStop={approveStopAndRecord} onRefreshGps={refreshGpsNow} onReportIssue={reportIssue}/> : role==="parent" ? <ParentDashboard data={data} simulation={simulation} driverGps={driverGps} tripEvents={tripEvents} feedbackRows={feedbackRows} authMode={authMode} onSubmitFeedback={submitFeedback}/> : <ExecutiveDashboard data={data} simulation={simulation} driverGps={driverGps}/> : view==="control" ? <ControlTower data={data} simulation={simulation} driverGps={driverGps} tripEvents={tripEvents}/> : view==="locations" ? <LocationsView data={data} role={role} simulation={simulation} saveStatus={saveStatus} onSaveLocation={saveLocation}/> : <DataView data={data} view={view} role={role} simulation={simulation} extraDrivers={extraDrivers} studentRows={studentRows} routeRows={routeRows} tripEvents={tripEvents} feedbackRows={feedbackRows} onAddDriver={addDriver} onAddStudent={addStudent} onAddRoute={addRoute} authMode={authMode}/>}</main><nav className="mobile-nav">{nav.slice(0,4).map(item=><button className={view===item.id?"active":""} onClick={()=>setView(item.id)} key={item.id}><item.icon/><span>{item.label}</span></button>)}</nav></SidebarInset>
  </SidebarProvider>{login&&<LoginDialog onClose={()=>setLogin(false)} onAuthenticated={enterAuthenticated}/>}</div>;
}
