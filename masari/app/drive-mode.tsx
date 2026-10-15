"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, LayoutList, Navigation, ScanLine } from "lucide-react";

// وضع القيادة للسائق أثناء الرحلة: بطاقة كبيرة للمحطة التالية، أزرار كبيرة (56px فأكثر) تُضغط والباص متوقف،
// زر طوارئ بضغط مطوّل (لا يُرسل بلمسة خاطئة)، والشاشة تبقى مضاءة طوال الرحلة.

type Stop = { label: string; lat: number; lng: number; time?: string; students?: string[] };
type Student = { id: string; name: string; status: string; checked: boolean; actions: { event: string; label: string }[] };

const HOLD_MS = 1500;

/** يبقي الشاشة مضاءة ما دام active، ويعيد الطلب عند الرجوع للتطبيق (المتصفح يلغيه عند إخفاء الصفحة). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let alive = true;
    const request = async () => {
      try {
        const l = await (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
        if (alive) lock = l; else void l.release();
      } catch { /* البطارية منخفضة أو غير مسموح: نكمل بدونها */ }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void request(); };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); void lock?.release().catch(() => {}); };
  }, [active]);
}

function HoldButton({ onConfirm, children }: { onConfirm: () => void; children: React.ReactNode }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const start = () => {
    setHolding(true);
    timer.current = window.setTimeout(() => { setHolding(false); timer.current = null; onConfirm(); }, HOLD_MS);
  };
  const cancel = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; setHolding(false); };
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  return <button type="button" className={`drive-sos ${holding ? "holding" : ""}`}
    onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()}
    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) start(); }} onKeyUp={cancel}
    aria-label="بلاغ طارئ: اضغط مطولًا ثانية ونصف للإرسال">
    <span className="drive-sos-fill" style={{ animationDuration: `${HOLD_MS}ms` }} /><span className="drive-sos-label">{children}</span>
  </button>;
}

export function DriveMode({ stop, finished, schoolName, distance, withinRadius, canApprove, approveLabel, students, navUrl, saveStatus, saveTone, stopsDone, stopsTotal,
  onApprove, onStudentEvent, onEmergency, onExit, onSkipStop, onScan, onEnd }: {
  stop: Stop | undefined; finished: boolean; schoolName: string; distance: number | null; withinRadius: boolean; canApprove: boolean; approveLabel: string;
  students: Student[]; navUrl: string | null; saveStatus: string; saveTone: "ok" | "error"; stopsDone: number; stopsTotal: number;
  onApprove: () => void; onStudentEvent: (id: string, event: string) => void; onEmergency: () => void; onExit: () => void;
  onSkipStop?: () => void; onScan?: () => void; onEnd?: () => void;
}) {
  useWakeLock(true);
  const here = new Set(stop?.students ?? []);
  // طلاب المحطة الحالية أولًا، ثم من لم يُسجَّل بعد
  const atStop = students.filter((s) => here.has(s.name) && s.actions.length);
  const others = students.filter((s) => !here.has(s.name) && s.actions.length);
  return <div className="drive-mode" role="region" aria-label="وضع القيادة">
    <div className="drive-top">
      <span>{stopsDone} من {stopsTotal} محطات</span>
      <button type="button" className="drive-exit" onClick={onExit}><LayoutList /> كل التفاصيل</button>
    </div>
    {saveStatus && <div className={`drive-status ${saveTone === "error" ? "error" : ""}`} role={saveTone === "error" ? "alert" : "status"}>{saveTone === "error" ? <AlertTriangle /> : <Check />}<span>{saveStatus}</span></div>}
    <section className="drive-card">
      <p>{finished ? "الوجهة" : "المحطة التالية"}</p>
      <h1>{finished ? schoolName : stop?.label ?? "—"}</h1>
      {!finished && <strong className={withinRadius ? "near" : ""}>{distance === null ? "بانتظار GPS" : withinRadius ? "وصلت المحطة" : distance >= 1000 ? `${(distance / 1000).toFixed(1)} كم` : `${distance} م`}{stop?.time ? ` · ${stop.time}` : ""}</strong>}
      {!finished && here.size > 0 && <small>{[...here].join("، ")}</small>}
      {navUrl && !finished && <a className="drive-nav" href={navUrl} target="_blank" rel="noreferrer"><Navigation /> الملاحة</a>}
    </section>
    {!finished && <button type="button" className="drive-approve" disabled={!canApprove} onClick={onApprove}><Check /> {approveLabel}</button>}
    {finished && onEnd && <button type="button" className="drive-approve" onClick={onEnd}><Check /> إنهاء الرحلة</button>}
    <div className="drive-secondary">
      {onScan && <button type="button" onClick={onScan}><ScanLine /> مسح بطاقة طالب</button>}
      {onSkipStop && <button type="button" className="skip-stop-link" onClick={onSkipStop}>تخطي المحطة بسبب</button>}
    </div>
    {(atStop.length > 0 || others.length > 0) && <section className="drive-students">
      {[...atStop, ...others].map((s) => <div className={`drive-student ${here.has(s.name) ? "here" : ""}`} key={s.id}>
        <span>{s.name}<small>{s.status}</small></span>
        <div>{s.actions.map((a) => <button type="button" key={a.event} className={a.event === "no_show" ? "secondary" : ""} onClick={() => onStudentEvent(s.id, a.event)}>{a.label}</button>)}</div>
      </div>)}
    </section>}
    <HoldButton onConfirm={onEmergency}><AlertTriangle /> اضغط مطولًا للبلاغ الطارئ</HoldButton>
  </div>;
}
