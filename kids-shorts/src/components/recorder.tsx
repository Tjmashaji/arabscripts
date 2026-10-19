"use client";
import { Mic, Square, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, upload } from "@/lib/client";
import { Button } from "./ui";

const MAX_MS = 11_000;

// تسجيل جملة المشهد من الميكروفون (أو رفع ملف صوتي)، ثم إرسالها للخادم الذي يقيس طولها ويقص الصمت
export function Recorder({ url, disabled, onDone, onError }: { url: string; disabled?: boolean; onDone: (payload: unknown) => void; onError: (msg: string) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), []);

  async function send(blob: Blob) {
    setState("uploading");
    try {
      onDone(await upload(url, blob, () => {}));
    } catch (e) {
      onError((e as ApiError).message);
    } finally {
      setState("idle");
    }
  }

  async function start() {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      onError("لم يُسمح باستخدام الميكروفون. اسمح به من إعدادات المتصفح، أو ارفع ملفًا صوتيًا.");
      return;
    }
    const r = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      void send(new Blob(chunks, { type: r.mimeType }));
    };
    rec.current = r;
    r.start();
    setState("recording");
    const t0 = Date.now();
    const tick = setInterval(() => {
      const ms = Date.now() - t0;
      setElapsed(ms);
      if (ms >= MAX_MS || r.state !== "recording") {
        clearInterval(tick);
        if (r.state === "recording") r.stop();
      }
    }, 100);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "recording" ? (
        <Button variant="danger" onClick={() => rec.current?.stop()} icon={<Square className="size-4" />}>
          إيقاف ({(elapsed / 1000).toFixed(1)} ث)
        </Button>
      ) : (
        <Button variant="secondary" onClick={start} disabled={disabled || state !== "idle"} loading={state === "uploading"} icon={<Mic className="size-4 text-danger" />}>
          سجّل الجملة
        </Button>
      )}
      <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={disabled || state !== "idle"} icon={<Upload className="size-4" />}>ملف</Button>
      <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void send(f); }} />
    </div>
  );
}
