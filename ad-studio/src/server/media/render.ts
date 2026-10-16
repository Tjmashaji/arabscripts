// محرك التصدير: يحوّل خطة مونتاج (ملفات فعلية + توقيتات) إلى فيديو نهائي عبر FFmpeg، ثم يتحقق من الناتج.
// لا يولّد أي محتوى بالذكاء الاصطناعي؛ يعمل فقط على الملفات الموجودة فعلًا.
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { buildAss, type AssLine } from "./ass";
import { ffmpeg, filterPath, FONTS_DIR } from "./ffmpeg";
import { probe } from "./probe";

export type RenderScene = {
  file: string;
  kind: "video" | "image";
  hasAudio: boolean;
  durationMs: number;
  // مدة المصدر الفعلية (للفيديو) لتجميد آخر إطار إذا كان أقصر من المشهد
  sourceDurationMs: number | null;
  trimStartMs: number;
  transition: "cut" | "fade" | "dissolve" | "slideleft" | "slideright" | "zoomin";
  onScreenText: string;
};

export type RenderPlan = {
  width: number;
  height: number;
  fps: number;
  scenes: RenderScene[];
  voice: { file: string; offsetMs: number; volume: number; text: string; durationMs: number | null }[];
  music: { file: string; volume: number; duck: boolean } | null;
  sceneVolume: number;
  subtitles: boolean;
  textStyle: { font: string; color: string; size: number; box: boolean; position: "top" | "center" | "bottom" };
  logo: { file: string; position: "top-left" | "top-right" | "bottom-left" | "bottom-right"; scale: number } | null;
  simulationWatermark: boolean;
  quality: "final" | "preview";
};

const TRANSITION_S = 0.5;
const CUT_S = 1 / 30;

export function sceneStarts(plan: Pick<RenderPlan, "scenes">) {
  let t = 0;
  return plan.scenes.map((s) => {
    const start = t;
    t += s.durationMs;
    return start;
  });
}

export function totalMs(plan: Pick<RenderPlan, "scenes">) {
  return plan.scenes.reduce((a, s) => a + s.durationMs, 0);
}

export async function render(plan: RenderPlan, outFile: string, onProgress?: (fraction: number) => void) {
  if (!plan.scenes.length) throw new Error("لا توجد مشاهد للتصدير.");
  const work = path.join(os.tmpdir(), "ad-studio-render", randomUUID());
  await mkdir(work, { recursive: true });
  try {
    const scale = plan.quality === "preview" ? 0.5 : 1;
    const W = Math.round((plan.width * scale) / 2) * 2, H = Math.round((plan.height * scale) / 2) * 2;
    const total = totalMs(plan) / 1000;
    const starts = sceneStarts(plan).map((ms) => ms / 1000);
    const args: string[] = [];
    const filters: string[] = [];
    let input = 0;

    // ───── المشاهد ─────
    // كل مقطع يطول بمقدار انتقال المشهد التالي حتى يتداخلا دون أن يتغير توقيت بداية المشاهد
    const sceneIdx: number[] = [];
    plan.scenes.forEach((s, i) => {
      const next = plan.scenes[i + 1];
      const tail = next ? (next.transition === "cut" ? CUT_S : TRANSITION_S) : 0;
      const len = s.durationMs / 1000 + tail;
      if (s.kind === "image") args.push("-loop", "1", "-framerate", String(plan.fps), "-t", len.toFixed(3), "-i", s.file);
      else args.push("-ss", (s.trimStartMs / 1000).toFixed(3), "-i", s.file);
      sceneIdx.push(input++);
      const avail = s.kind === "video" && s.sourceDurationMs ? s.sourceDurationMs / 1000 - s.trimStartMs / 1000 : len;
      const pad = Math.max(0, len - avail + 0.1);
      const cover = s.kind === "image"
        // صورة ثابتة: تكبير بسيط وحركة أفقية بطيئة عبر الصورة
        ? `scale=${Math.round(W * 1.12)}:${Math.round(H * 1.12)}:force_original_aspect_ratio=increase,crop=${W}:${H}:x='(iw-${W})*t/${len.toFixed(3)}':y='(ih-${H})/2'`
        : `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
      filters.push(`[${sceneIdx[i]}:v]${cover},setsar=1,fps=${plan.fps},format=yuv420p${pad > 0 ? `,tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}` : ""},trim=duration=${len.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    });

    // ───── الانتقالات ─────
    let chain = "v0";
    for (let i = 1; i < plan.scenes.length; i++) {
      const t = plan.scenes[i].transition;
      const d = t === "cut" ? CUT_S : TRANSITION_S;
      const name = t === "cut" ? "fade" : t;
      filters.push(`[${chain}][v${i}]xfade=transition=${name}:duration=${d.toFixed(3)}:offset=${starts[i].toFixed(3)}[x${i}]`);
      chain = `x${i}`;
    }

    // ───── النصوص والترجمة (ASS عبر libass لتشكيل العربية واتجاهها) ─────
    const lines: AssLine[] = [];
    plan.scenes.forEach((s, i) => {
      if (s.onScreenText.trim()) lines.push({ startMs: starts[i] * 1000 + 150, endMs: starts[i] * 1000 + s.durationMs - 100, text: s.onScreenText, style: "Title" });
    });
    if (plan.subtitles) {
      for (const v of plan.voice) {
        const dur = v.durationMs ?? 3000;
        lines.push(...splitSubtitle(v.text, v.offsetMs, dur));
      }
    }
    if (plan.simulationWatermark) lines.push({ startMs: 0, endMs: total * 1000, text: "محاكاة — ليست نتيجة إنتاج", style: "Sim" });
    if (lines.length) {
      const assFile = path.join(work, "text.ass");
      await writeFile(assFile, buildAss({ width: W, height: H, lines, ...plan.textStyle }));
      filters.push(`[${chain}]subtitles='${filterPath(assFile)}':fontsdir='${filterPath(FONTS_DIR)}'[vt]`);
      chain = "vt";
    }

    // ───── الشعار ─────
    if (plan.logo) {
      args.push("-loop", "1", "-t", total.toFixed(3), "-i", plan.logo.file);
      const li = input++;
      const lw = Math.round(W * plan.logo.scale);
      const m = Math.round(Math.min(W, H) * 0.04);
      const pos = { "top-left": `${m}:${m}`, "top-right": `W-w-${m}:${m}`, "bottom-left": `${m}:H-h-${m}`, "bottom-right": `W-w-${m}:H-h-${m}` }[plan.logo.position];
      filters.push(`[${li}:v]scale=${lw}:-2,format=rgba[lg]`, `[${chain}][lg]overlay=${pos}:shortest=1[vl]`);
      chain = "vl";
    }
    filters.push(`[${chain}]trim=duration=${total.toFixed(3)},setpts=PTS-STARTPTS[vout]`);

    // ───── الصوت ─────
    const voiceLabels: string[] = [];
    for (const [k, v] of plan.voice.entries()) {
      args.push("-i", v.file);
      const ai = input++;
      const ms = Math.round(v.offsetMs);
      filters.push(`[${ai}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${v.volume.toFixed(2)},adelay=${ms}|${ms}[vo${k}]`);
      voiceLabels.push(`[vo${k}]`);
    }
    const sceneAudio: string[] = [];
    if (plan.sceneVolume > 0) {
      plan.scenes.forEach((s, i) => {
        if (s.kind !== "video" || !s.hasAudio) return;
        const ms = Math.round(starts[i] * 1000);
        filters.push(`[${sceneIdx[i]}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${(s.durationMs / 1000).toFixed(3)},asetpts=PTS-STARTPTS,volume=${plan.sceneVolume.toFixed(2)},adelay=${ms}|${ms}[sa${i}]`);
        sceneAudio.push(`[sa${i}]`);
      });
    }
    const mixParts: string[] = [];
    let voiceMix: string | null = null;
    if (voiceLabels.length) {
      filters.push(`${voiceLabels.join("")}amix=inputs=${voiceLabels.length}:normalize=0:dropout_transition=0,apad[voice]`);
      voiceMix = "voice";
    }
    if (plan.music) {
      args.push("-stream_loop", "-1", "-i", plan.music.file);
      const mi = input++;
      filters.push(`[${mi}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${total.toFixed(3)},volume=${plan.music.volume.toFixed(2)},afade=t=out:st=${Math.max(0, total - 1.5).toFixed(3)}:d=1.5[mus]`);
      if (plan.music.duck && voiceMix) {
        // خفض الموسيقى تلقائيًا تحت التعليق الصوتي
        filters.push(`[voice]asplit=2[voice][vkey]`, `[mus][vkey]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[musd]`);
        mixParts.push("[musd]");
      } else mixParts.push("[mus]");
    }
    if (voiceMix) mixParts.push(`[${voiceMix}]`);
    mixParts.push(...sceneAudio);
    if (mixParts.length) {
      filters.push(`${mixParts.join("")}amix=inputs=${mixParts.length}:normalize=0:dropout_transition=0,apad,atrim=duration=${total.toFixed(3)},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`);
    } else {
      // منصات التواصل تفضّل وجود مسار صوت حتى لو صامت
      filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${total.toFixed(3)}[aout]`);
    }

    const filterFile = path.join(work, "graph.txt");
    await writeFile(filterFile, filters.join(";\n"));
    await ffmpeg(
      [
        ...args,
        "-filter_complex_script", filterFile,
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", plan.quality === "preview" ? "ultrafast" : "medium", "-crf", plan.quality === "preview" ? "28" : "20", "-pix_fmt", "yuv420p", "-r", String(plan.fps),
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart",
        "-t", total.toFixed(3),
        outFile,
      ],
      { onProgress: (s) => onProgress?.(Math.min(0.99, s / total)), timeoutMs: 30 * 60_000 },
    );

    // ───── التحقق من الملف الناتج ─────
    const p = await probe(outFile);
    if (!p.hasVideo || !p.hasAudio) throw new Error("الملف الناتج لا يحتوي على مسار صورة وصوت.");
    if (p.width !== W || p.height !== H) throw new Error(`أبعاد الملف الناتج (${p.width}×${p.height}) لا تطابق المطلوب (${W}×${H}).`);
    if (!p.durationMs || Math.abs(p.durationMs / 1000 - total) > 0.25) throw new Error(`مدة الملف الناتج (${(p.durationMs ?? 0) / 1000}ث) لا تطابق المطلوب (${total}ث).`);
    return { width: W, height: H, durationMs: p.durationMs };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

// تقسيم نص التعليق إلى أسطر ترجمة قصيرة موزعة على مدة المقطع الصوتي
export function splitSubtitle(text: string, startMs: number, durMs: number, maxWords = 7): AssLine[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return [];
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) chunks.push(words.slice(i, i + maxWords).join(" "));
  const per = durMs / words.length;
  let t = startMs;
  return chunks.map((c) => {
    const n = c.split(" ").length;
    const line = { startMs: t, endMs: t + n * per, text: c, style: "Caption" as const };
    t += n * per;
    return line;
  });
}
