// محرك التصدير: يحوّل مشاهد الدرس إلى مقطع شورتس عمودي 1080×1920 عبر FFmpeg، ثم يتحقق من الناتج.
// المرحلة 1: مقطع صامت لكل مشهد (خلفية + هالة + رسوم متحركة). المرحلة 2: الانتقالات والنصوص والصوت.
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { emojiFile } from "@/lib/emoji";
import { buildAss, heroSize, splitCaption, type AssLine } from "./ass";
import { ffmpeg, filterPath, FONTS_DIR } from "./ffmpeg";
import { writeMusic } from "./music";
import { probe } from "./probe";

export const EMOJI_DIR = path.resolve(process.cwd(), "assets", "emoji");

export type RenderScene = { durationMs: number; bg: string; emoji: string[]; text: string; narration: string; voice: string | null; voiceMs: number | null };
export type RenderPlan = { width: number; height: number; fps: number; scenes: RenderScene[]; music: "none" | "calm" | "happy"; captions: boolean };

// انتقال واحد ثابت بين كل المشاهد: تلاشٍ متقاطع قصير يمنع القفز دون أن يشتت الطفل
const TRANSITION_S = 0.3;
const VOICE_DELAY_MS = 250;

export const totalMs = (p: Pick<RenderPlan, "scenes">) => p.scenes.reduce((a, s) => a + s.durationMs, 0);
export const sceneStarts = (p: Pick<RenderPlan, "scenes">) => {
  let t = 0;
  return p.scenes.map((s) => ((t += s.durationMs), t - s.durationMs));
};

// أماكن الرسوم ومقاساتها حسب عددها (نسبة من العرض)، في وسط الشاشة بين العنوان والترجمة
export function layout(n: number, W: number, H: number, hasTitle: boolean): { x: number; y: number; size: number }[] {
  const cy = H * (hasTitle ? 0.47 : 0.45);
  const grid = (cols: number, rows: number, size: number, gap: number) => {
    const out: { x: number; y: number; size: number }[] = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const inRow = Math.min(cols, n - r * cols);
      const x = W / 2 + (c - (inRow - 1) / 2) * (size + gap);
      const y = cy + (r - (rows - 1) / 2) * (size + gap);
      out.push({ x, y, size });
    }
    return out;
  };
  const w = W / 1080;
  if (n === 1) return grid(1, 1, Math.round(600 * w), 0);
  if (n === 2) return grid(2, 1, Math.round(420 * w), Math.round(40 * w));
  if (n === 3) return grid(3, 1, Math.round(300 * w), Math.round(30 * w));
  if (n === 4) return grid(2, 2, Math.round(360 * w), Math.round(50 * w));
  return grid(3, 2, Math.round(290 * w), Math.round(30 * w));
}

// تفتيح أو تغميق لون بنسبة (-1..1)
export function shade(hex: string, amt: number) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const out = c.map((v) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)));
  return out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

async function renderSceneClip(s: RenderScene, i: number, W: number, H: number, fps: number, len: number, out: string, work: string) {
  // تدرج من الأفتح في الأعلى إلى الأغمق في الأسفل، يُرسم مرة واحدة كصورة ثابتة
  const bgFile = path.join(work, `bg${i}.png`);
  await ffmpeg(["-f", "lavfi", "-i", `gradients=s=${W}x${H}:c0=0x${shade(s.bg, 0.18)}:c1=0x${shade(s.bg, -0.12)}:x0=0:y0=0:x1=0:y1=${H}:nb_colors=2`, "-frames:v", "1", bgFile]);
  const args: string[] = ["-loop", "1", "-framerate", String(fps), "-t", len.toFixed(3), "-i", bgFile];
  const f: string[] = [`[0:v]format=yuv420p[bg0]`];
  let chain = "bg0";
  let input = 1;
  const hasTitle = Boolean(s.text.trim());
  if (s.emoji.length) {
    // هالة بيضاء شفافة خلف الرسوم
    const haloSize = Math.round(W * 0.95);
    args.push("-loop", "1", "-framerate", String(fps), "-t", len.toFixed(3), "-i", path.join(EMOJI_DIR, `${emojiFile("⚪")}.png`));
    f.push(`[${input}:v]scale=${haloSize}:${haloSize},format=rgba,colorchannelmixer=aa=0.22[halo]`, `[${chain}][halo]overlay=x=(W-w)/2:y=${Math.round(H * (hasTitle ? 0.47 : 0.45))}-h/2:format=auto[bgh]`);
    chain = "bgh";
    input++;
    const spots = layout(s.emoji.length, W, H, hasTitle);
    s.emoji.forEach((e, k) => {
      const { x, y, size } = spots[k];
      // ظهور متتابع بفارق 80ms، بعد بدء التلاشي بين المشهدين
      const delay = 0.15 + k * 0.08;
      const phase = (k * 1.3 + i).toFixed(2);
      // نابض مخمَّد (ارتداد ≈ 0.2): يبدأ من 65% من الحجم لا من الصفر، ويستقر خلال نصف ثانية تقريبًا
      const p = `max(0,t-${delay})`;
      const spring = `(1-0.35*exp(-9*${p})*cos(14*${p}))`;
      args.push("-loop", "1", "-framerate", String(fps), "-t", len.toFixed(3), "-i", path.join(EMOJI_DIR, `${emojiFile(e)}.png`));
      // ظهور بالتكبير ثم تمايل خفيف للأعلى والأسفل
      f.push(
        `[${input}:v]format=rgba,fade=t=in:st=${delay}:d=0.18:alpha=1,scale=w='trunc(${size}*${spring}/2)*2':h=-2:eval=frame[e${k}]`,
        // تمايل هادئ ومستمر (حركة ثابتة الإيقاع) بعد الاستقرار
        `[${chain}][e${k}]overlay=x='${x.toFixed(1)}-w/2':y='${y.toFixed(1)}-h/2+${Math.round(size * 0.025)}*sin(2*PI*0.5*t+${phase})':eval=frame:format=auto[c${k}]`,
      );
      chain = `c${k}`;
      input++;
    });
  }
  f.push(`[${chain}]format=yuv420p,trim=duration=${len.toFixed(3)},setpts=PTS-STARTPTS[v]`);
  await ffmpeg([...args, "-filter_complex", f.join(";"), "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(fps), out], { timeoutMs: 5 * 60_000 });
}

export async function render(plan: RenderPlan, outFile: string, thumbFile: string, onProgress?: (fraction: number, message: string) => void) {
  if (plan.scenes.length < 1) throw new Error("لا توجد مشاهد للتصدير.");
  const work = path.join(os.tmpdir(), "kids-shorts-render", randomUUID());
  await mkdir(work, { recursive: true });
  try {
    const { width: W, height: H, fps } = plan;
    const total = totalMs(plan) / 1000;
    const starts = sceneStarts(plan).map((ms) => ms / 1000);

    // ───── المرحلة 1: مقطع لكل مشهد، يطول بمقدار الانتقال التالي حتى يتداخلا ─────
    const clips: string[] = [];
    for (const [i, s] of plan.scenes.entries()) {
      const len = s.durationMs / 1000 + (i < plan.scenes.length - 1 ? TRANSITION_S : 0);
      const clip = path.join(work, `scene${i}.mp4`);
      onProgress?.((i / plan.scenes.length) * 0.6, `رسم المشهد ${i + 1} من ${plan.scenes.length}…`);
      await renderSceneClip(s, i, W, H, fps, len, clip, work);
      clips.push(clip);
    }

    // ───── المرحلة 2: الانتقالات + النصوص + الصوت ─────
    const args: string[] = [];
    const f: string[] = [];
    clips.forEach((c) => args.push("-i", c));
    let chain = "0:v";
    for (let i = 1; i < clips.length; i++) {
      f.push(`[${chain}][${i}:v]xfade=transition=fade:duration=${TRANSITION_S}:offset=${starts[i].toFixed(3)}[x${i}]`);
      chain = `x${i}`;
    }

    const lines: AssLine[] = [];
    plan.scenes.forEach((s, i) => {
      const t0 = starts[i] * 1000, t1 = t0 + s.durationMs;
      if (s.text.trim()) lines.push(s.emoji.length ? { startMs: t0 + 80, endMs: t1, text: s.text, style: "Title" } : { startMs: t0 + 80, endMs: t1, text: s.text, style: "Hero", size: heroSize(s.text) });
      if (plan.captions && s.narration.trim()) {
        const dur = s.voiceMs ?? s.durationMs - 600;
        lines.push(...splitCaption(s.narration, t0 + (s.voice ? VOICE_DELAY_MS : 200), dur));
      }
    });
    const assFile = path.join(work, "text.ass");
    await writeFile(assFile, buildAss(W, H, lines));
    f.push(`[${chain}]subtitles='${filterPath(assFile)}':fontsdir='${filterPath(FONTS_DIR)}',trim=duration=${total.toFixed(3)},setpts=PTS-STARTPTS[vout]`);

    let input = clips.length;
    const voices: string[] = [];
    plan.scenes.forEach((s, i) => {
      if (!s.voice) return;
      args.push("-i", s.voice);
      const ms = Math.round(starts[i] * 1000 + VOICE_DELAY_MS);
      // قص الصوت داخل مدة مشهده حتى لا يتداخل مع المشهد التالي
      f.push(`[${input}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${(s.durationMs / 1000 - 0.3).toFixed(3)},adelay=${ms}|${ms}[vo${i}]`);
      voices.push(`[vo${i}]`);
      input++;
    });
    const mix: string[] = [];
    if (voices.length) f.push(`${voices.join("")}amix=inputs=${voices.length}:normalize=0:dropout_transition=0,apad[voice]`);
    if (plan.music !== "none") {
      const musicFile = path.join(work, "music.wav");
      await writeMusic(musicFile, plan.music, total + 1);
      args.push("-i", musicFile);
      f.push(`[${input}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=duration=${total.toFixed(3)},volume=${voices.length ? 0.22 : 0.5},afade=t=in:d=0.5,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(3)}:d=1.2[mus]`);
      input++;
      if (voices.length) {
        // خفض الموسيقى تلقائيًا تحت التعليق الصوتي
        f.push(`[voice]asplit=2[voice][vkey]`, `[mus][vkey]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=300[musd]`);
        mix.push("[musd]");
      } else mix.push("[mus]");
    }
    if (voices.length) mix.push("[voice]");
    if (mix.length) f.push(`${mix.join("")}amix=inputs=${mix.length}:normalize=0:dropout_transition=0,apad,atrim=duration=${total.toFixed(3)},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[aout]`);
    // يوتيوب يقبل المقطع الصامت، لكن وجود مسار صوت يجنّب مشاكل بعض المشغلات
    else f.push(`anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=${total.toFixed(3)}[aout]`);

    const graph = path.join(work, "graph.txt");
    await writeFile(graph, f.join(";\n"));
    onProgress?.(0.6, "تركيب المقطع النهائي…");
    await ffmpeg(
      [
        ...args,
        "-filter_complex_script", graph,
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(fps),
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
        "-movflags", "+faststart",
        "-t", total.toFixed(3),
        outFile,
      ],
      { onProgress: (sec) => onProgress?.(0.6 + 0.38 * Math.min(1, sec / total), "تركيب المقطع النهائي…"), timeoutMs: 20 * 60_000 },
    );

    // صورة مصغرة من منتصف المشهد الأول
    await ffmpeg(["-ss", Math.min(1.2, plan.scenes[0].durationMs / 2000).toFixed(2), "-i", outFile, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "3", thumbFile]);

    // ───── التحقق من الملف الناتج ─────
    const p = await probe(outFile);
    if (!p.hasVideo || !p.hasAudio) throw new Error("الملف الناتج لا يحتوي على مسار صورة وصوت.");
    if (p.width !== W || p.height !== H) throw new Error(`أبعاد الملف الناتج (${p.width}×${p.height}) لا تطابق المطلوب (${W}×${H}).`);
    if (!p.durationMs || Math.abs(p.durationMs / 1000 - total) > 0.3) throw new Error(`مدة الملف الناتج (${(p.durationMs ?? 0) / 1000}ث) لا تطابق المطلوب (${total}ث).`);
    return { width: W, height: H, durationMs: p.durationMs };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
