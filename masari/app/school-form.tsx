"use client";
/* eslint-disable @next/next/no-img-element -- موقع ثابت: معاينة الشعار المحلية وصور التخزين لا تمر عبر next/image */

import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, LocateFixed, Upload, X } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// نموذج تسجيل المدرسة الكامل: الشعار، الاسم، التفاصيل، والموقع على الخريطة.
// يُحفظ الطلب بحالة pending حتى يعتمده مدير النظام.

const CITIES = ["الرياض", "جدة", "مكة المكرمة", "المدينة المنورة", "الدمام", "الخبر", "الظهران", "الأحساء", "الطائف", "تبوك", "بريدة", "عنيزة", "حائل", "أبها", "خميس مشيط", "جازان", "نجران", "الباحة", "الجبيل", "ينبع", "القطيف", "سكاكا", "عرعر", "حفر الباطن", "الخرج", "المجمعة", "أخرى"];
const TIMEZONES = [
  { id: "Asia/Riyadh", label: "السعودية (Asia/Riyadh)" }, { id: "Asia/Dubai", label: "الإمارات (Asia/Dubai)" },
  { id: "Asia/Kuwait", label: "الكويت (Asia/Kuwait)" }, { id: "Asia/Qatar", label: "قطر (Asia/Qatar)" },
  { id: "Asia/Bahrain", label: "البحرين (Asia/Bahrain)" }, { id: "Asia/Muscat", label: "عُمان (Asia/Muscat)" },
  { id: "Asia/Amman", label: "الأردن (Asia/Amman)" }, { id: "Africa/Cairo", label: "مصر (Africa/Cairo)" },
];
const RIYADH = { lat: 24.7136, lng: 46.6753 };
const MAX_LOGO = 2 * 1024 * 1024;

type Point = { lat: number; lng: number };
const validPoint = (p: { lat: string; lng: string }): Point | null => {
  const lat = Number(p.lat), lng = Number(p.lng);
  return p.lat.trim() && p.lng.trim() && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

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
      const start = value ?? RIYADH;
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

type Form = {
  nameAr: string; nameEn: string; description: string; address: string; city: string; phone: string; email: string;
  website: string; timezone: string; radius: string; pickup: string; dropoff: string; contact: string; lat: string; lng: string;
};
const EMPTY: Form = { nameAr: "", nameEn: "", description: "", address: "", city: "", phone: "", email: "", website: "", timezone: "Asia/Riyadh", radius: "250", pickup: "07:00", dropoff: "14:00", contact: "", lat: "", lng: "" };

export function SchoolRegistrationForm({ defaultEmail, onSubmitted }: { defaultEmail?: string; onSubmitted: () => void }) {
  const [form, setForm] = useState<Form>({ ...EMPTY, email: defaultEmail ?? "" });
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [dragging, setDragging] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (key: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const point = validPoint(form);
  const radius = Number(form.radius);

  const problems: Partial<Record<keyof Form | "logo", string>> = {};
  if (form.nameAr.trim().length < 3) problems.nameAr = "اكتب اسم المدرسة بالعربية.";
  if (form.description.trim().length < 10) problems.description = "اكتب وصفًا مختصرًا (10 أحرف على الأقل).";
  if (!form.address.trim()) problems.address = "العنوان مطلوب.";
  if (!form.city) problems.city = "اختر المدينة.";
  if (!/^[+0-9\s-]{8,16}$/.test(form.phone.trim())) problems.phone = "رقم هاتف غير صحيح.";
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) problems.email = "بريد غير صحيح.";
  if (form.website.trim() && !/^https?:\/\/\S+\.\S+/.test(form.website.trim())) problems.website = "اكتب الرابط كاملًا يبدأ بـ https://";
  if (!Number.isInteger(radius) || radius < 30 || radius > 2000) problems.radius = "بين 30 و2000 متر.";
  if (!form.contact.trim()) problems.contact = "اسم المسؤول مطلوب.";
  if (!point) problems.lat = "حدد موقع المدرسة على الخريطة.";
  const show = (k: keyof typeof problems) => touched && problems[k] ? <small className="field-error">{problems[k]}</small> : null;

  const pickLogo = (file?: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { setError("الشعار يجب أن يكون صورة PNG أو JPG أو WEBP أو SVG."); return; }
    if (file.size > MAX_LOGO) { setError("حجم الشعار يجب ألا يتجاوز 2 ميجابايت."); return; }
    setError(""); setLogo(file);
    setLogoPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
  };

  const submit = async () => {
    setTouched(true); setError("");
    if (Object.keys(problems).length) { setError("أكمل الحقول المطلوبة المعلّمة باللون الأحمر."); return; }
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const uid = session.session?.user.id;
      if (!uid) throw new Error("NO_SESSION");
      let logoUrl: string | null = null;
      if (logo) {
        const ext = logo.type === "image/svg+xml" ? "svg" : logo.type.split("/")[1].replace("jpeg", "jpg");
        const path = `${uid}/logo-${Date.now()}.${ext}`;
        const up = await supabase.storage.from("school-logos").upload(path, logo, { contentType: logo.type, upsert: false });
        if (up.error) throw new Error("LOGO_UPLOAD");
        logoUrl = supabase.storage.from("school-logos").getPublicUrl(path).data.publicUrl;
      }
      const { error: insertError } = await supabase.from("schools").insert({
        name: form.nameAr.trim(), name_en: form.nameEn.trim() || null, description: form.description.trim(),
        address: form.address.trim(), city: form.city, phone: form.phone.trim(), email: form.email.trim().toLowerCase(),
        website: form.website.trim() || null, timezone: form.timezone, stop_radius_m: radius,
        default_pickup_time: form.pickup, default_dropoff_time: form.dropoff, contact_name: form.contact.trim(),
        latitude: point!.lat, longitude: point!.lng, logo_url: logoUrl, status: "pending", created_by: uid,
      });
      if (insertError) throw insertError;
      onSubmitted();
    } catch (e) {
      setError((e as Error).message === "LOGO_UPLOAD" ? "تعذر رفع الشعار. جرّب صورة أصغر أو أرسل بدون شعار." : "تعذر إرسال الطلب. تحقق من البيانات وحاول مرة أخرى.");
    } finally { setBusy(false); }
  };

  return <div className="school-form">
    <div className="school-form-head"><h1>أخبرنا عن مدرستك</h1><p>أكمل ملف مدرستك لإرسال طلب التسجيل. سيراجعه فريق مساري ويُفعَّل حسابك بعد الاعتماد.</p></div>

    <section className="sf-card"><h2>شعار المدرسة</h2>
      <div className={`logo-drop ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); pickLogo(e.dataTransfer.files?.[0]); }} onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}>
        {logoPreview ? <img src={logoPreview} alt="معاينة الشعار" /> : <ImagePlus />}
        <span>{logo ? logo.name : <>اسحب الشعار وأفلته هنا أو <b>تصفّح</b></>}</span>
        <small>PNG أو JPG أو SVG، حتى 2 ميجابايت (اختياري)</small>
        {logo && <button type="button" className="logo-remove" aria-label="إزالة الشعار" onClick={(e) => { e.stopPropagation(); setLogo(null); setLogoPreview(""); }}><X /></button>}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => pickLogo(e.target.files?.[0])} />
    </section>

    <section className="sf-card"><h2>الاسم</h2>
      <div className="sf-grid">
        <label><span>الاسم (عربي)<b className="req">*</b></span><input value={form.nameAr} onChange={set("nameAr")} placeholder="مثال: مدارس الأفق الأهلية" />{show("nameAr")}</label>
        <label>الاسم (إنجليزي)<input dir="ltr" value={form.nameEn} onChange={set("nameEn")} placeholder="Al-Ofoq Private Schools" /></label>
      </div>
    </section>

    <section className="sf-card"><h2>تفاصيل المدرسة</h2>
      <label className="sf-wide"><span>وصف المدرسة<b className="req">*</b></span><textarea value={form.description} onChange={set("description")} placeholder="المراحل الدراسية، عدد الطلاب التقريبي، ونطاق خدمة النقل." />{show("description")}</label>
      <div className="sf-grid sf-grid-4">
        <label><span>عنوان المدرسة<b className="req">*</b></span><input value={form.address} onChange={set("address")} placeholder="الحي، الشارع" />{show("address")}</label>
        <label><span>المدينة<b className="req">*</b></span><select value={form.city} onChange={set("city")}><option value="">اختر</option>{CITIES.map((c) => <option key={c}>{c}</option>)}</select>{show("city")}</label>
        <label><span>هاتف المدرسة<b className="req">*</b></span><input dir="ltr" inputMode="tel" value={form.phone} onChange={set("phone")} placeholder="05xxxxxxxx" />{show("phone")}</label>
        <label><span>بريد المدرسة<b className="req">*</b></span><input dir="ltr" type="email" value={form.email} onChange={set("email")} placeholder="info@school.sa" />{show("email")}</label>
        <label><span>اسم المسؤول<b className="req">*</b></span><input value={form.contact} onChange={set("contact")} placeholder="مدير النقل أو المدرسة" />{show("contact")}</label>
        <label>الموقع الإلكتروني<input dir="ltr" value={form.website} onChange={set("website")} placeholder="https://" />{show("website")}</label>
        <label><span>المنطقة الزمنية<b className="req">*</b></span><select value={form.timezone} onChange={set("timezone")}>{TIMEZONES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
        <label>نطاق السياج الجغرافي (متر)<input inputMode="numeric" value={form.radius} onChange={set("radius")} />{show("radius")}<small className="muted-label">المسافة المسموح فيها للسائق باعتماد الوصول للمحطة.</small></label>
        <label>وقت الاصطحاب الافتراضي<input type="time" value={form.pickup} onChange={set("pickup")} /></label>
        <label>وقت التوصيل الافتراضي<input type="time" value={form.dropoff} onChange={set("dropoff")} /></label>
      </div>
    </section>

    <section className="sf-card"><h2>الموقع</h2>
      <p className="muted-label">اضغط على موقع المدرسة في الخريطة أو اسحب الدبوس، أو استخدم «الموقع الحالي» إن كنت في المدرسة الآن.<b className="req">*</b></p>
      <MapPicker value={point} onChange={(p) => setForm((f) => ({ ...f, lat: String(p.lat), lng: String(p.lng) }))} />
      <div className="sf-grid">
        <label>خط العرض<input dir="ltr" inputMode="decimal" value={form.lat} onChange={set("lat")} placeholder="24.7136" /></label>
        <label>خط الطول<input dir="ltr" inputMode="decimal" value={form.lng} onChange={set("lng")} placeholder="46.6753" /></label>
      </div>
      {show("lat")}
    </section>

    {error && <p className="save-strip ops-message ops-error"><X /><span>{error}</span></p>}
    <Button className="wide-action sf-submit" disabled={busy} onClick={() => void submit()}>{busy ? <><Upload /> جارٍ الإرسال…</> : <><Check /> إرسال طلب التسجيل</>}</Button>
  </div>;
}
