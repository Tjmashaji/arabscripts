"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker, Polyline, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Maximize2 } from "lucide-react";

// خريطة الرحلة (Leaflet): المحطات مرقّمة بالترتيب، ومسار الطريق الفعلي بين المحطات (OSRM)،
// والمدرسة، وبيت الطالب لولي الأمر، وموقع الباص المباشر. إن تعذر جلب مسار الطريق نرسم خطًا مستقيمًا متقطعًا.

export type MapPoint = { lat: number; lng: number };
export type MapStop = MapPoint & { label: string; done?: boolean; students?: string[] };

const OSRM = "https://router.project-osrm.org/route/v1/driving/";
const roadCache = new Map<string, [number, number][] | null>();

async function roadPath(points: MapPoint[]): Promise<[number, number][] | null> {
  if (points.length < 2 || points.length > 40) return null;
  const key = points.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  if (roadCache.has(key)) return roadCache.get(key) ?? null;
  try {
    const ctrl = new AbortController(); const t = window.setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${OSRM}${key}?overview=full&geometries=geojson`, { signal: ctrl.signal });
    window.clearTimeout(t);
    const json = await res.json() as { routes?: { geometry: { coordinates: [number, number][] } }[] };
    const coords = json.routes?.[0]?.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]) ?? null;
    roadCache.set(key, coords);
    return coords;
  } catch { roadCache.set(key, null); return null; }
}

// روابط الملاحة في خرائط Google (تفتح تطبيق الخرائط على الجوال)
export const navigateUrl = (dest: MapPoint) => `https://www.google.com/maps/dir/?api=1&destination=${dest.lat},${dest.lng}&travelmode=driving`;
export const fullRouteUrl = (stops: MapPoint[]) => {
  if (!stops.length) return "";
  const dest = stops[stops.length - 1];
  const way = stops.slice(0, -1).slice(0, 9).map((s) => `${s.lat},${s.lng}`).join("|");
  return `${navigateUrl(dest)}${way ? `&waypoints=${encodeURIComponent(way)}` : ""}`;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));

export function TripMap({ stops, school, bus, nextIndex, home, previous, actual, follow = false, className = "" }: {
  stops: MapStop[]; school?: MapPoint & { label?: string } | null; bus?: MapPoint | null; nextIndex?: number;
  home?: MapPoint & { label?: string } | null; previous?: MapPoint & { label?: string } | null; actual?: MapPoint[]; follow?: boolean; className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const busMarker = useRef<Marker | null>(null);
  const roadLine = useRef<Polyline | null>(null);
  const [ready, setReady] = useState(false);
  const [following, setFollowing] = useState(follow);
  const [roadOk, setRoadOk] = useState<boolean | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);

  // إنشاء الخريطة مرة واحدة
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((lib) => {
      if (cancelled || !box.current || map.current) return;
      L.current = lib;
      const m = lib.map(box.current, { zoomControl: true, attributionControl: true }).setView([24.15, 47.31], 12);
      lib.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      m.on("dragstart", () => setFollowing(false));
      map.current = m; layer.current = lib.layerGroup().addTo(m);
      setReady(true);
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; layer.current = null; busMarker.current = null; roadLine.current = null; };
  }, []);

  const stopsKey = JSON.stringify([stops.map((s) => [s.lat, s.lng, s.label, s.done, s.students]), school && [school.lat, school.lng], home && [home.lat, home.lng], previous && [previous.lat, previous.lng], actual?.length, nextIndex]);

  const fit = () => {
    const lib = L.current, m = map.current; if (!lib || !m) return;
    const pts: [number, number][] = [...stops.map((s) => [s.lat, s.lng] as [number, number])];
    if (school) pts.push([school.lat, school.lng]);
    if (home) pts.push([home.lat, home.lng]);
    if (previous) pts.push([previous.lat, previous.lng]);
    if (actual?.length) actual.forEach((p) => pts.push([p.lat, p.lng]));
    if (bus) pts.push([bus.lat, bus.lng]);
    if (pts.length === 1) m.setView(pts[0], 16); else if (pts.length) m.fitBounds(lib.latLngBounds(pts), { padding: [28, 28], maxZoom: 16 });
  };

  // المحطات والمسار
  useEffect(() => {
    const lib = L.current, m = map.current, g = layer.current;
    if (!ready || !lib || !m || !g) return;
    g.clearLayers(); roadLine.current = null;
    const ordered: MapPoint[] = [...stops];
    const lastIsSchool = school && stops.length && Math.abs(stops[stops.length - 1].lat - school.lat) < 1e-4 && Math.abs(stops[stops.length - 1].lng - school.lng) < 1e-4;
    if (school && !lastIsSchool) ordered.push(school);
    const straight = lib.polyline(ordered.map((p) => [p.lat, p.lng] as [number, number]), { color: "#1f8a93", weight: 4, opacity: 0.55, dashArray: "8 8" }).addTo(g);
    stops.forEach((s, i) => {
      const cls = s.done ? "done" : i === nextIndex ? "next" : "";
      const tip = `<strong>${i + 1}. ${esc(s.label)}</strong>${s.students?.length ? `<br>${s.students.map(esc).join("، ")}` : ""}`;
      lib.marker([s.lat, s.lng], { icon: lib.divIcon({ className: `trip-stop ${cls}`, html: `<span>${s.done ? "✓" : i + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }), zIndexOffset: i === nextIndex ? 500 : 0 })
        .addTo(g).bindPopup(tip);
    });
    if (school && !lastIsSchool) lib.marker([school.lat, school.lng], { icon: lib.divIcon({ className: "trip-school", html: "<span>🏫</span>", iconSize: [32, 32], iconAnchor: [16, 16] }) }).addTo(g).bindPopup(esc(school.label ?? "المدرسة"));
    if (home) lib.marker([home.lat, home.lng], { icon: lib.divIcon({ className: "trip-home", html: "<span>🏠</span>", iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(g).bindPopup(esc(home.label ?? "البيت"));
    if (actual && actual.length > 1) { lib.polyline(actual.map((p) => [p.lat, p.lng] as [number, number]), { color: "#e08a1e", weight: 4, opacity: 0.9 }).addTo(g); }
    if (previous) lib.marker([previous.lat, previous.lng], { icon: lib.divIcon({ className: "trip-prev", html: "<span>📍</span>", iconSize: [30, 30], iconAnchor: [15, 15] }) }).addTo(g).bindPopup(esc(previous.label ?? "الموقع السابق"));
    fit();
    let alive = true;
    if (ordered.length < 2) { straight.remove(); return () => { alive = false; }; }
    void roadPath(ordered).then((coords) => {
      if (!alive || !layer.current) return;
      setRoadOk(Boolean(coords));
      if (!coords) return;
      straight.remove();
      roadLine.current = lib.polyline(coords, { color: "#1f8a93", weight: 5, opacity: 0.85 }).addTo(layer.current);
    });
    return () => { alive = false; };
    // stopsKey يختصر كل ما يغير الرسم
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stopsKey]);

  // الباص: يتحرك دون إعادة رسم الخريطة
  useEffect(() => {
    const lib = L.current, m = map.current;
    if (!ready || !lib || !m) return;
    if (!bus) { busMarker.current?.remove(); busMarker.current = null; return; }
    if (!busMarker.current) busMarker.current = lib.marker([bus.lat, bus.lng], { icon: lib.divIcon({ className: "trip-bus", html: "<span>🚌</span>", iconSize: [38, 38], iconAnchor: [19, 19] }), zIndexOffset: 1000 }).addTo(m).bindPopup("الباص الآن");
    else busMarker.current.setLatLng([bus.lat, bus.lng]);
    if (following) m.setView([bus.lat, bus.lng], Math.max(m.getZoom(), 16), { animate: true });
  }, [ready, bus?.lat, bus?.lng, following, bus]);

  return <div className={`trip-map ${className}`}>
    <div ref={box} className="trip-map-canvas" role="application" aria-label="خريطة الرحلة والمحطات" />
    <div className="trip-map-tools">
      <button type="button" onClick={fit} title="عرض المسار كاملًا"><Maximize2 /> المسار كامل</button>
      {bus && <button type="button" className={following ? "on" : ""} onClick={() => setFollowing((f) => !f)} title="تتبع الباص"><Crosshair /> {following ? "يتتبع الباص" : "تتبع الباص"}</button>}
    </div>
    {roadOk === false && <p className="trip-map-note">الخط المتقطع اتجاه تقريبي بين المحطات.</p>}
  </div>;
}
