"use client";
// معاينة تقريبية داخل المتصفح: تشغّل المشاهد والتعليق والموسيقى والنصوص بنفس التوقيت.
// المعاينة الدقيقة (الانتقالات والخطوط كما ستُصدَّر) تأتي من التصدير التجريبي عبر FFmpeg.
import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sceneStarts } from "@/lib/timing";
import type { Bundle } from "./project-context";
import { cx, SimBadge } from "./ui";

const RATIO: Record<string, string> = { "9:16": "9 / 16", "16:9": "16 / 9", "1:1": "1 / 1", "4:5": "4 / 5" };

export function SequencePlayer({ data, className }: { data: Bundle; className?: string }) {
  const tl = data.timeline.data;
  const assets = useMemo(() => new Map(data.assets.map((a) => [a.id, a])), [data.assets]);
  const scenes = useMemo(() => {
    const starts = sceneStarts(data.scenes.map((s) => s.duration_ms));
    return data.scenes.map((s, i) => ({ ...s, start: starts[i], asset: s.selected_asset_id ? assets.get(s.selected_asset_id) : undefined }));
  }, [data.scenes, assets]);
  const total = scenes.reduce((a, s) => a + s.duration_ms, 0);
  const voices = useMemo(
    () => data.audio.filter((a) => a.kind === "voiceover" && a.status === "ready" && a.url).map((a) => ({ ...a, start: (scenes.find((s) => s.id === a.scene_id)?.start ?? 0) + a.offset_ms, dur: a.asset_duration_ms ?? 3000 })),
    [data.audio, scenes],
  );
  const music = tl.music_asset_id ? assets.get(tl.music_asset_id) : undefined;
  const logo = tl.logo.asset_id ? assets.get(tl.logo.asset_id) : undefined;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const startAt = useRef(0);
  const media = useRef(new Map<string, HTMLMediaElement>());
  const musicEl = useRef<HTMLAudioElement>(null);

  const stop = useCallback(() => {
    setPlaying(false);
    media.current.forEach((m) => m.pause());
    musicEl.current?.pause();
  }, []);

  // حلقة التشغيل: تعمل فقط أثناء التشغيل وتتوقف عند النهاية
  useEffect(() => {
    if (!playing) return;
    const origin = performance.now() - startAt.current;
    let id = 0;
    const frame = () => {
      const now = performance.now() - origin;
      if (now >= total) {
        setT(total);
        stop();
        return;
      }
      setT(now);
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [playing, total, stop]);

  function play() {
    startAt.current = t >= total ? 0 : t;
    setPlaying(true);
  }

  const current = scenes.find((s) => t >= s.start && t < s.start + s.duration_ms) ?? scenes[scenes.length - 1];
  const activeVoice = voices.find((v) => t >= v.start && t < v.start + v.dur);

  // مزامنة عناصر الوسائط مع الزمن الحالي
  useEffect(() => {
    for (const s of scenes) {
      const el = media.current.get(`scene-${s.id}`);
      if (!el) continue;
      const on = s.id === current?.id && playing;
      const want = s.trim_start_ms / 1000 + (t - s.start) / 1000;
      el.volume = Math.min(1, tl.scene_volume);
      el.muted = tl.scene_volume === 0;
      if (on) {
        if (Math.abs(el.currentTime - want) > 0.35) el.currentTime = Math.max(0, want);
        if (el.paused) void el.play().catch(() => {});
      } else if (!el.paused) el.pause();
    }
    for (const v of voices) {
      const el = media.current.get(`voice-${v.id}`);
      if (!el) continue;
      const on = playing && t >= v.start && t < v.start + v.dur;
      el.volume = Math.min(1, Number(v.volume) * tl.voice_volume);
      if (on) {
        if (el.paused) {
          el.currentTime = (t - v.start) / 1000;
          void el.play().catch(() => {});
        }
      } else if (!el.paused) el.pause();
    }
    const m = musicEl.current;
    if (m) {
      m.volume = Math.min(1, tl.music_volume * (tl.duck_music && activeVoice ? 0.35 : 1));
      if (playing && m.paused) {
        m.currentTime = (t / 1000) % (m.duration || Infinity);
        void m.play().catch(() => {});
      }
      if (!playing && !m.paused) m.pause();
    }
  }, [t, playing, scenes, voices, current, activeVoice, tl]);

  const subtitle = useMemo(() => {
    if (!tl.subtitles || !activeVoice) return "";
    const words = activeVoice.text.split(/\s+/).filter(Boolean);
    const per = activeVoice.dur / Math.max(1, words.length);
    const idx = Math.floor((t - activeVoice.start) / per);
    const chunk = Math.floor(idx / 7);
    return words.slice(chunk * 7, chunk * 7 + 7).join(" ");
  }, [activeVoice, t, tl.subtitles]);

  const simulated = scenes.some((s) => s.asset?.is_simulated) || voices.some((v) => v.is_simulated);
  const style = tl.text_style;
  const pos = { top: "top-[8%]", center: "top-1/2 -translate-y-1/2", bottom: "bottom-[8%]" }[style.position];
  const logoPos = { "top-left": "top-[4%] left-[4%]", "top-right": "top-[4%] right-[4%]", "bottom-left": "bottom-[4%] left-[4%]", "bottom-right": "bottom-[4%] right-[4%]" }[tl.logo.position];

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="relative mx-auto w-full max-h-[70vh] bg-black rounded-2xl overflow-hidden" style={{ aspectRatio: RATIO[tl.aspect] }}>
        {scenes.map((s) => {
          const a = s.asset;
          const on = s.id === current?.id;
          const fade = s.transition === "cut" ? "" : "transition-opacity duration-500";
          if (!a) return on ? <div key={s.id} className="absolute inset-0 grid place-items-center text-white/60 text-sm">المشهد {s.position + 1} بلا مادة</div> : null;
          return a.kind === "video" ? (
            <video key={s.id} ref={(el) => { if (el) media.current.set(`scene-${s.id}`, el); }} src={`${a.url}#t=${(s.trim_start_ms / 1000 + 0.05).toFixed(2)}`} playsInline preload="auto" className={cx("absolute inset-0 size-full object-cover", fade, on ? "opacity-100" : "opacity-0")} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={s.id} src={a.url} alt="" className={cx("absolute inset-0 size-full object-cover", fade, on ? "opacity-100" : "opacity-0")} style={{ transform: on ? `scale(1.12) translateX(${(((t - s.start) / s.duration_ms) * 6 - 3).toFixed(2)}%)` : "scale(1.12)" }} />
          );
        })}
        {current?.on_screen_text ? <p className="absolute inset-x-[6%] top-1/2 -translate-y-1/2 text-center font-display text-white text-[clamp(18px,4.5vw,36px)] leading-relaxed [text-shadow:0_3px_12px_rgba(0,0,0,.7)]">{current.on_screen_text}</p> : null}
        {subtitle ? (
          <p className={cx("absolute inset-x-[6%] text-center", pos)}>
            <span className="inline px-2 py-0.5 rounded leading-loose" style={{ color: style.color, background: style.box ? "rgba(0,0,0,.6)" : "transparent", fontSize: `clamp(12px, ${style.size / 22}vw, ${style.size / 2.4}px)`, fontFamily: style.font === "Noto Kufi Arabic" ? "var(--font-display)" : "var(--font-sans)", textShadow: style.box ? undefined : "0 2px 6px rgba(0,0,0,.8)" }}>{subtitle}</span>
          </p>
        ) : null}
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo.url} alt="الشعار" className={cx("absolute", logoPos)} style={{ width: `${tl.logo.scale * 100}%` }} />
        ) : null}
        {simulated ? <SimBadge className="absolute top-2 start-2" /> : null}
        {voices.map((v) => <audio key={v.id} ref={(el) => { if (el) media.current.set(`voice-${v.id}`, el); }} src={v.url!} preload="auto" />)}
        {music ? <audio ref={musicEl} src={music.url} loop preload="auto" /> : null}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={playing ? stop : play} className="grid size-11 place-items-center rounded-full bg-ink text-white" aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}>{playing ? <Pause className="size-5" /> : <Play className="size-5" />}</button>
        <button onClick={() => { stop(); setT(0); }} className="grid size-9 place-items-center rounded-full hover:bg-surface-2" aria-label="من البداية"><RotateCcw className="size-4" /></button>
        <input type="range" min={0} max={total} step={50} value={t} onChange={(e) => { stop(); setT(Number(e.target.value)); }} className="flex-1" aria-label="موضع التشغيل" />
        <span className="text-xs text-muted ltr w-24 text-end">{(t / 1000).toFixed(1)} / {(total / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}
