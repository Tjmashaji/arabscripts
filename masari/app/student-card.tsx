"use client";
/* eslint-disable @next/next/no-img-element -- صورة QR مولّدة محليًا (data URL) */

import { useEffect, useRef, useState } from "react";
import { BusFront, Camera, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// بطاقة الطالب: رمز QR يحمل "masari:qr:<qr_token>". السائق يمسحه فيُسجَّل الصعود أو النزول،
// والخادم (record_attendance_qr) يتحقق أن الطالب في هذه الرحلة وأن البطاقة غير موقوفة.

export type CardStudent = { id: string; full_name: string; grade: string | null; qr_token: string; route?: string | null; stop?: string | null };

const qrPayload = (token: string) => `masari:qr:${token}`;
export const cardNumber = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();

function useQr(token: string, size = 220) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    void import("qrcode").then((QR) => QR.toDataURL(qrPayload(token), { errorCorrectionLevel: "M", margin: 1, width: size, color: { dark: "#10394b", light: "#ffffff" } }))
      .then((url) => { if (alive) setSrc(url); }).catch(() => {});
    return () => { alive = false; };
  }, [token, size]);
  return src;
}

export function StudentCard({ student, schoolName }: { student: CardStudent; schoolName: string }) {
  const qr = useQr(student.qr_token);
  return <div className="student-card" dir="rtl">
    <div className="sc-head"><span className="sc-logo"><BusFront /></span><div><strong>مساري</strong><span>بطاقة النقل المدرسي</span></div></div>
    <div className="sc-body">
      <div className="sc-info">
        <strong className="sc-name">{student.full_name}</strong>
        <span>{[student.grade, schoolName].filter(Boolean).join(" · ")}</span>
        {student.route && <span>المسار: {student.route}</span>}
        {student.stop && <span>المحطة: {student.stop}</span>}
        <span className="sc-no" dir="ltr">No. {cardNumber(student.id)}</span>
      </div>
      {qr ? <img className="sc-qr" src={qr} alt={`رمز بطاقة ${student.full_name}`} /> : <span className="sc-qr sc-qr-loading" />}
    </div>
    <p className="sc-foot">تُعرض على السائق عند الصعود والنزول. عند فقدها تُطلب بطاقة جديدة من المدرسة.</p>
  </div>;
}

// ورقة طباعة: بطاقات كثيرة في صفحة A4
export function CardsSheet({ students, schoolName, onClose }: { students: CardStudent[]; schoolName: string; onClose: () => void }) {
  return <div className="cards-sheet-overlay">
    <div className="cards-sheet-bar no-print"><strong>بطاقات الطلاب ({students.length})</strong><div className="ops-actions"><Button onClick={() => window.print()}><Printer /> طباعة</Button><Button variant="outline" onClick={onClose}><X /> إغلاق</Button></div></div>
    <div className="cards-sheet print-area">{students.map((s) => <StudentCard key={s.id} student={s} schoolName={schoolName} />)}</div>
  </div>;
}

// ───────── ماسح البطاقات للسائق ─────────
type ScanResult = { id: number; ok: boolean; text: string };
const eventText: Record<string, string> = { boarded: "صعد الباص", arrived_school: "وصل المدرسة", boarded_return: "صعد للعودة", dropped_home: "نزل عند المنزل" };
const scanError = (m: string) => m.includes("QR_INVALID") ? "هذا الرمز ليس بطاقة مساري." : m.includes("QR_NOT_IN_TRIP") ? "الطالب ليس في هذه الرحلة، أو البطاقة موقوفة." : m.includes("ALREADY_RECORDED") ? "سُجّل هذا الطالب مسبقًا." : m.includes("STOP_NOT_REACHED") ? "اعتمد وصولك لمحطة الطالب أولًا." : m.includes("TRIP_NOT_ACTIVE") ? "الرحلة لم تبدأ أو انتهت." : "تعذر التسجيل. حاول مرة أخرى.";

export function QrScanner({ tripId, names, gps, onClose, onRecorded }: { tripId: string; names: Record<string, string>; gps: { lat: number; lng: number } | null; onClose: () => void; onRecorded: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const [results, setResults] = useState<ScanResult[]>([]);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const busy = useRef(false);
  const gpsRef = useRef(gps);
  const namesRef = useRef(names);
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => { gpsRef.current = gps; namesRef.current = names; onRecordedRef.current = onRecorded; }, [gps, names, onRecorded]);

  useEffect(() => {
    let stream: MediaStream | null = null; let timer: number | null = null; let stopped = false;
    const push = (r: Omit<ScanResult, "id">) => setResults((cur) => [{ ...r, id: Date.now() }, ...cur].slice(0, 6));
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setError("المتصفح لا يدعم الكاميرا. سجّل الحضور يدويًا."); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }); }
      catch { setError("اسمح لمساري باستخدام الكاميرا من إعدادات المتصفح، ثم أعد المحاولة."); return; }
      if (stopped || !video.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.current.srcObject = stream; await video.current.play().catch(() => {});
      const jsQR = (await import("jsqr")).default;
      timer = window.setInterval(() => {
        const v = video.current, c = canvas.current;
        if (!v || !c || v.readyState < 2 || busy.current) return;
        c.width = v.videoWidth; c.height = v.videoHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true }); if (!ctx) return;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: "dontInvert" });
        if (!code?.data) return;
        const now = Date.now();
        if (code.data === last.current.code && now - last.current.at < 4000) return;
        last.current = { code: code.data, at: now };
        busy.current = true;
        void (async () => {
          const g = gpsRef.current;
          const { data, error: err } = await supabase.rpc("record_attendance_qr", { p_trip: tripId, p_qr: code.data, p_lat: g?.lat ?? null, p_lng: g?.lng ?? null, p_device: navigator.userAgent.slice(0, 120) });
          busy.current = false;
          if (err) { push({ ok: false, text: scanError(err.message) }); navigator.vibrate?.([80, 60, 80]); return; }
          const r = data as { student_id: string; to: string };
          push({ ok: true, text: `${namesRef.current[r.student_id] ?? "الطالب"}: ${eventText[r.to] ?? r.to}` });
          navigator.vibrate?.(120);
          onRecordedRef.current();
        })();
      }, 300);
    };
    void start();
    return () => { stopped = true; if (timer) window.clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [tripId]);

  return <div className="scanner-overlay" role="dialog" aria-label="مسح بطاقة الطالب">
    <div className="scanner-bar"><strong><Camera className="inline-icon" /> وجّه الكاميرا إلى بطاقة الطالب</strong><Button variant="outline" onClick={onClose}><X /> إنهاء المسح</Button></div>
    {error ? <p className="scanner-error">{error}</p> : <div className="scanner-view"><video ref={video} playsInline muted /><span className="scanner-frame" /></div>}
    <canvas ref={canvas} hidden />
    <div className="scanner-results">{results.map((r) => <p key={r.id} className={r.ok ? "ok" : "bad"}>{r.ok ? "✓" : "✕"} {r.text}</p>)}</div>
  </div>;
}
