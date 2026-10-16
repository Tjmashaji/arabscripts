// توليد محاكاة للفيديو والصور والصوت محليًا بـ FFmpeg، لاختبار المسار كاملًا بلا مفاتيح.
// كل ملف يحمل وسم "محاكاة" ظاهرًا داخله، ويُحفظ بعلامة is_simulated، ولا يُعرض كنتيجة إنتاج.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ASPECT_SIZE } from "@/lib/domain";
import { buildAss } from "../../media/ass";
import { ffmpeg, filterPath, FONTS_DIR } from "../../media/ffmpeg";
import type { AsyncGenerationProvider, GenerationRequest, PollResult, SpeechGenerationProvider } from "../types";

const TMP = path.join(os.tmpdir(), "ad-studio-sim");
const results = new Map<string, PollResult>();

async function render(kind: "video" | "image", req: GenerationRequest): Promise<string> {
  await mkdir(TMP, { recursive: true });
  const { width, height } = ASPECT_SIZE[req.aspect];
  // دقة منخفضة لتسريع المحاكاة؛ المونتاج يعيد التحجيم
  const w = Math.round(width / 2 / 2) * 2, h = Math.round(height / 2 / 2) * 2;
  const id = randomUUID();
  const assFile = path.join(TMP, `${id}.ass`);
  const dur = kind === "video" ? Math.max(1, req.durationS) : 1;
  await writeFile(assFile, buildAss({
    // الوسم أعلى الإطار حتى لا يتداخل مع نصوص المونتاج في المنتصف والأسفل
    width: w, height: h, font: "IBM Plex Sans Arabic", color: "#FFFFFF", size: 40, box: true, position: "top",
    lines: [
      { startMs: 0, endMs: dur * 1000, text: "محاكاة — ليست نتيجة إنتاج", style: "Sim" },
      { startMs: 0, endMs: dur * 1000, text: req.label, style: "Caption" },
    ],
  }));
  const out = path.join(TMP, `${id}.${kind === "video" ? "mp4" : "png"}`);
  const vf = `subtitles='${filterPath(assFile)}':fontsdir='${filterPath(FONTS_DIR)}'`;
  const src = `gradients=s=${w}x${h}:c0=0x0B2A3A:c1=0x1F8A93:c2=0x2D3A4A:n=3:speed=0.015:d=${dur}:r=30`;
  if (kind === "video") await ffmpeg(["-f", "lavfi", "-i", src, "-vf", vf, "-t", String(dur), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", out]);
  else await ffmpeg(["-f", "lavfi", "-i", src, "-vf", vf, "-frames:v", "1", out]);
  await rm(assFile, { force: true });
  return out;
}

function simProvider(kind: "video" | "image"): AsyncGenerationProvider {
  return {
    info: { id: "simulation", label: "محاكاة تطويرية", mode: "simulation", setup: kind === "video" ? "أضف RUNWAY_API_KEY لتفعيل توليد الفيديو الحقيقي." : "لا يوجد مزود صور حقيقي مفعّل بعد (انظر AI_PROVIDERS.md)." },
    capabilities: { aspects: ["9:16", "16:9", "1:1", "4:5"], durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], supportsReferenceImage: false, requiresReferenceImage: false },
    async submit(req) {
      const id = `sim_${randomUUID()}`;
      try {
        const file = await render(kind, req);
        results.set(id, { state: "succeeded", output: { localFile: file, mime: kind === "video" ? "video/mp4" : "image/png" }, cost: { costCents: 0, costIsEstimate: false } });
      } catch (e) {
        results.set(id, { state: "failed", error: `فشلت المحاكاة: ${(e as Error).message}`, retryable: false });
      }
      return { providerJobId: id, estimatedCost: { costCents: 0, costIsEstimate: false } };
    },
    async poll(id) {
      // العامل نفسه نفّذ الإرسال، فالنتيجة في الذاكرة؛ بعد إعادة التشغيل تُعاد المحاولة
      return results.get(id) ?? { state: "failed", error: "انتهت صلاحية نتيجة المحاكاة.", retryable: true };
    },
  };
}

export const simulationVideo = simProvider("video");
export const simulationImage = simProvider("image");

export const simulationSpeech: SpeechGenerationProvider = {
  info: { id: "simulation", label: "محاكاة تطويرية", mode: "simulation", setup: "أضف ELEVENLABS_API_KEY لتفعيل التعليق الصوتي الحقيقي." },
  dialects: ["ar_msa", "ar_sa", "ar_gulf", "ar_eg"],
  async voices() {
    return [
      { id: "sim-male", name: "صوت محاكاة (رجالي)", gender: "male", languages: ["ar"], note: "نغمات بديلة بطول الجملة، ليست صوتًا بشريًا" },
      { id: "sim-female", name: "صوت محاكاة (نسائي)", gender: "female", languages: ["ar"], note: "نغمات بديلة بطول الجملة، ليست صوتًا بشريًا" },
    ];
  },
  async synthesize(req) {
    await mkdir(TMP, { recursive: true });
    // مدة تقريبية للنطق: 2.3 كلمة في الثانية مقسومة على السرعة
    const n = Math.max(1, req.text.split(/\s+/).filter(Boolean).length);
    const dur = Math.max(0.8, n / 2.3 / req.speed);
    const f = req.voiceId === "sim-female" ? 330 : 220;
    const out = path.join(TMP, `${randomUUID()}.mp3`);
    // نبضات قصيرة بعدد الكلمات تقريبًا: تُسمع بوضوح أنها ليست كلامًا
    const expr = `0.25*sin(2*PI*${f}*t)*lt(mod(t\\,${(dur / n).toFixed(3)})\\,${((dur / n) * 0.6).toFixed(3)})`;
    await ffmpeg(["-f", "lavfi", "-i", `aevalsrc=${expr}:s=44100:d=${dur.toFixed(2)}`, "-c:a", "libmp3lame", "-b:a", "96k", out]);
    const audio = await readFile(out);
    await rm(out, { force: true });
    return { audio, mime: "audio/mpeg", ext: "mp3", costCents: 0, costIsEstimate: false };
  },
};
