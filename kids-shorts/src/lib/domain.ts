import { z } from "zod";
import { isKnownEmoji } from "./emoji";

// المجالات التعليمية. "builtin" يعني أن المنصة تولّد الدرس من بيانات مدققة دون ذكاء اصطناعي.
export const CATEGORIES = {
  letters: { label: "الحروف العربية", icon: "🔤", builtin: true, hint: "حرف مع كلمات تبدأ به" },
  numbers: { label: "الأرقام والعد", icon: "🔢", builtin: true, hint: "عدّ من ١ إلى ١٠" },
  colors: { label: "الألوان", icon: "🎨", builtin: true, hint: "لون وأشياء بلونه" },
  shapes: { label: "الأشكال", icon: "🔺", builtin: true, hint: "دائرة، مربع، مثلث…" },
  animals: { label: "الحيوانات", icon: "🦁", builtin: true, hint: "حيوان ومعلومة بسيطة عنه" },
  manners: { label: "آداب وعادات", icon: "🤝", builtin: true, hint: "غسل اليدين، الشكر، المشاركة…" },
  custom: { label: "موضوع من اختيارك", icon: "✨", builtin: false, hint: "يكتبه المخرج الذكي (Claude)" },
} as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_IDS = Object.keys(CATEGORIES) as Category[];

export const AGES = { "3-5": "٣ إلى ٥ سنوات", "6-8": "٦ إلى ٨ سنوات" } as const;
export type Age = keyof typeof AGES;

export const VOICE_MODES = {
  ai: "صوت ذكي (ElevenLabs)",
  recorded: "تسجيل صوتي بصوتك",
  none: "بدون تعليق صوتي (نص وموسيقى)",
} as const;
export type VoiceMode = keyof typeof VOICE_MODES;

export const MUSIC = { none: "بدون موسيقى", calm: "لحن هادئ", happy: "لحن مرح" } as const;
export type Music = keyof typeof MUSIC;

export const PRIVACY = { private: "خاص", unlisted: "غير مدرج", public: "عام" } as const;
export type Privacy = keyof typeof PRIVACY;

// ألوان خلفية مريحة للأطفال (تباين جيد مع النص الأبيض المحاط بحد داكن)
export const BACKGROUNDS = ["#FF8A65", "#FFB74D", "#FFD54F", "#AED581", "#4DB6AC", "#4FC3F7", "#7986CB", "#BA68C8", "#F06292", "#A1887F", "#90A4AE", "#26A69A"];

export const LIMITS = {
  scenes: { min: 2, max: 14 },
  narration: 220,
  text: 40,
  emoji: 6,
  // يوتيوب يقبل الشورتس حتى ثلاث دقائق؛ نُبقي المقاطع التعليمية للأطفال قصيرة
  totalMs: 90_000,
  sceneMs: { min: 2000, max: 12_000 },
};

export const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "لون غير صالح");

export const sceneSchema = z.object({
  id: z.string().min(1).max(40),
  narration: z.string().trim().max(LIMITS.narration, `التعليق ${LIMITS.narration} حرفًا كحد أقصى`),
  text: z.string().trim().max(LIMITS.text, `النص الظاهر ${LIMITS.text} حرفًا كحد أقصى`),
  emoji: z.array(z.string().refine(isKnownEmoji, "رسم غير موجود في المكتبة")).max(LIMITS.emoji),
  bg: hex,
});
export type SceneInput = z.infer<typeof sceneSchema>;

export type Scene = SceneInput & {
  position: number;
  audio: { file: string; durationMs: number; source: "ai" | "recorded"; text: string } | null;
};

export const scenesSchema = z.array(sceneSchema).min(LIMITS.scenes.min, `${LIMITS.scenes.min} مشاهد على الأقل`).max(LIMITS.scenes.max, `${LIMITS.scenes.max} مشهدًا كحد أقصى`);

export const newProjectSchema = z.object({
  category: z.enum(CATEGORY_IDS as [Category, ...Category[]]),
  subject: z.string().trim().min(1, "اختر الموضوع").max(200),
  age: z.enum(["3-5", "6-8"]),
  voiceMode: z.enum(["ai", "recorded", "none"]),
  music: z.enum(["none", "calm", "happy"]),
});
export type NewProject = z.infer<typeof newProjectSchema>;

export const youtubeMetaSchema = z.object({
  title: z.string().trim().min(1, "العنوان مطلوب").max(100, "عنوان يوتيوب 100 حرف كحد أقصى").refine((s) => !/[<>]/.test(s), "العنوان لا يقبل < أو >"),
  description: z.string().trim().max(5000).refine((s) => !/[<>]/.test(s), "الوصف لا يقبل < أو >"),
  tags: z.array(z.string().trim().min(1).max(30)).max(15),
});
export type YoutubeMeta = z.infer<typeof youtubeMetaSchema>;

export type JobKind = "script" | "speech" | "render" | "upload";
export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

// مدة المشهد: مدة الصوت مع هامش، أو تقدير من عدد الكلمات بإيقاع بطيء يناسب الأطفال
export function sceneDurationMs(s: { narration: string; audio: { durationMs: number } | null }) {
  const base = s.audio ? s.audio.durationMs + 700 : Math.max(1, s.narration.split(/\s+/).filter(Boolean).length) * 520 + 1200;
  return Math.round(Math.min(LIMITS.sceneMs.max, Math.max(LIMITS.sceneMs.min, base)));
}
