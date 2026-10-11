"use client";

import { useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

// منتقي موقع المدرسة على الخريطة (OpenStreetMap عبر Leaflet)، يُستخدم في إضافة المدارس من لوحة الإدارة.

const KHARJ = { lat: 24.1556, lng: 47.3120 };

type Point = { lat: number; lng: number };

// خريطة تفاعلية (OpenStreetMap عبر Leaflet): الضغط أو سحب الدبوس يحدد الموقع.
export function MapPicker({ value, onChange }: { value: Point | null; onChange: (p: Point) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !box.current || map.current) return;
      const start = value ?? KHARJ;
      const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], value ? 16 : 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
      const icon = L.divIcon({ className: "map-pin", html: "<span></span>", iconSize: [28, 28], iconAnchor: [14, 28] });
      const mk = L.marker([start.lat, start.lng], { draggable: true, icon, opacity: value ? 1 : 0.55 }).addTo(m);
      const set = (lat: number, lng: number) => { mk.setLatLng([lat, lng]).setOpacity(1); onChangeRef.current({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) }); };
      mk.on("dragend", () => { const p = mk.getLatLng(); set(p.lat, p.lng); });
      m.on("click", (e) => set(e.latlng.lat, e.latlng.lng));
      map.current = m; marker.current = mk;
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; marker.current = null; };
    // الخريطة تُنشأ مرة واحدة؛ تحديث الموقع لاحقًا في التأثير التالي.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // إدخال الإحداثيات يدويًا يحرّك الدبوس.
  useEffect(() => {
    if (!value || !marker.current || !map.current) return;
    const cur = marker.current.getLatLng();
    if (Math.abs(cur.lat - value.lat) < 1e-6 && Math.abs(cur.lng - value.lng) < 1e-6) return;
    marker.current.setLatLng([value.lat, value.lng]).setOpacity(1);
    map.current.setView([value.lat, value.lng], Math.max(map.current.getZoom(), 15));
  }, [value]);

  const locate = () => {
    if (!("geolocation" in navigator)) { setNote("المتصفح لا يدعم تحديد الموقع."); return; }
    setLocating(true); setNote("");
    navigator.geolocation.getCurrentPosition((pos) => {
      setLocating(false);
      const p = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) };
      onChangeRef.current(p);
      map.current?.setView([p.lat, p.lng], 17);
    }, () => { setLocating(false); setNote("تعذر تحديد موقعك. اسمح بالوصول للموقع أو حدده على الخريطة."); }, { enableHighAccuracy: true, timeout: 12000 });
  };

  return <div className="map-picker">
    <div ref={box} className="map-picker-canvas" role="application" aria-label="خريطة تحديد موقع المدرسة" />
    <button type="button" className="map-locate" onClick={locate} disabled={locating}><LocateFixed /> {locating ? "جارٍ التحديد…" : "الموقع الحالي"}</button>
    {note && <p className="muted-label">{note}</p>}
  </div>;
}
