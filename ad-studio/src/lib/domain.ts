// تعريفات المجال المشتركة بين الواجهة والخادم: القيم المسموحة وتسمياتها العربية ومخططات التحقق.
import { z } from "zod";

const options = <T extends string>(entries: readonly (readonly [T, string])[]) => ({
  values: entries.map(([v]) => v) as [T, ...T[]],
  label: Object.fromEntries(entries) as Record<T, string>,
  list: entries.map(([value, label]) => ({ value, label })),
});

export const BUSINESS_TYPES = options([
  ["restaurant_cafe", "المطاعم والمقاهي"],
  ["real_estate", "العقارات"],
  ["perfume_beauty", "العطور ومستحضرات التجميل"],
  ["fashion", "الأزياء والملابس"],
  ["ecommerce", "المتاجر الإلكترونية"],
  ["automotive", "السيارات"],
  ["professional_services", "الخدمات المهنية"],
  ["tourism_hospitality", "السياحة والضيافة"],
  ["other", "نشاط آخر"],
] as const);

export const STYLES = options([
  ["trendy", "ترندي"],
  ["cinematic", "سينمائي"],
  ["luxury", "فاخر"],
  ["realistic", "واقعي"],
  ["comedy", "كوميدي"],
  ["story", "قصصي"],
  ["emotional", "عاطفي"],
  ["documentary", "وثائقي"],
  ["direct_sale", "إعلان مباشر للبيع"],
] as const);

export const GOALS = options([
  ["attract_customers", "جذب العملاء"],
  ["increase_sales", "زيادة المبيعات"],
  ["product_launch", "إطلاق منتج"],
  ["brand_awareness", "تعريف بالعلامة التجارية"],
  ["increase_visits", "زيادة الزيارات"],
  ["increase_orders", "زيادة الطلبات والحجوزات"],
] as const);

export const CHARACTER_TYPES = options([
  ["narrator", "راوٍ صوتي دون ظهور شخصية"],
  ["virtual_presenter", "مقدم افتراضي"],
  ["cartoon", "شخصية كرتونية"],
  ["ai_human", "شخصية بشرية مولّدة بالذكاء الاصطناعي"],
  ["product_only", "المنتج وحده دون شخصية"],
] as const);

export const PLATFORMS = options([
  ["tiktok", "TikTok"],
  ["snapchat", "Snapchat"],
  ["reels", "Instagram Reels"],
  ["shorts", "YouTube Shorts"],
  ["youtube", "YouTube أفقي"],
  ["website", "موقع إلكتروني"],
  ["multi", "إعلان متعدد المقاسات"],
] as const);

export const ASPECTS = ["9:16", "16:9", "1:1", "4:5"] as const;
export type Aspect = (typeof ASPECTS)[number];
export const PLATFORM_ASPECT: Record<(typeof PLATFORMS.values)[number], Aspect> = {
  tiktok: "9:16", snapchat: "9:16", reels: "9:16", shorts: "9:16", youtube: "16:9", website: "16:9", multi: "9:16",
};
export const ASPECT_SIZE: Record<Aspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export const LANGUAGES = options([
  ["ar_msa", "العربية الفصحى"],
  ["ar_sa", "اللهجة السعودية"],
  ["ar_gulf", "اللهجة الخليجية"],
  ["ar_eg", "اللهجة المصرية"],
] as const);

export const VOICE_TONES = options([
  ["calm", "هادئ"],
  ["fast", "سريع"],
  ["energetic", "حماسي"],
  ["luxury", "فاخر"],
] as const);

export const MODES = options([
  ["auto", "أنشئ الإعلان لي"],
  ["own_idea", "لدي فكرة جاهزة"],
  ["template", "استخدم قالبًا جاهزًا"],
] as const);

export const TRANSITIONS = options([
  ["cut", "قطع مباشر"],
  ["fade", "تلاشٍ"],
  ["dissolve", "مزج"],
  ["slideleft", "انزلاق لليسار"],
  ["slideright", "انزلاق لليمين"],
  ["zoomin", "تكبير"],
] as const);

export const JOB_STATUS_LABEL = {
  queued: "في الانتظار",
  processing: "قيد التنفيذ",
  completed: "مكتملة",
  failed: "فشلت",
  cancelled: "أُلغيت",
} as const;

export const JOB_TYPE_LABEL = {
  director: "المخرج الإبداعي",
  analyze_media: "تحليل الوسائط",
  generate_video: "توليد فيديو",
  generate_image: "توليد صورة",
  generate_speech: "توليد صوت",
  export: "تصدير الفيديو",
} as const;

const text = (max: number) => z.string().trim().max(max);

// ───── بيانات النشاط (الخطوة الأولى) ─────
export const brandInput = z.object({
  name: text(120).min(1, "اسم النشاط مطلوب"),
  business_type: z.enum(BUSINESS_TYPES.values),
  description: text(2000).default(""),
  audience: text(500).default(""),
  city: text(120).default(""),
  differentiator: text(500).default(""),
  offer: text(300).default(""),
  contact: text(300).default(""),
});
export type BrandInput = z.infer<typeof brandInput>;

// ───── إعدادات الإعلان (الخطوتان الثالثة والرابعة) ─────
export const projectSettings = z.object({
  style: z.enum(STYLES.values).default("trendy"),
  duration_s: z.coerce.number().int().min(6).max(120).default(30),
  goal: z.enum(GOALS.values).default("attract_customers"),
  character_type: z.enum(CHARACTER_TYPES.values).default("narrator"),
  platform: z.enum(PLATFORMS.values).default("reels"),
  aspect: z.enum(ASPECTS).default("9:16"),
  language: z.enum(LANGUAGES.values).default("ar_sa"),
  voice_gender: z.enum(["male", "female"]).default("male"),
  voice_tone: z.enum(VOICE_TONES.values).default("energetic"),
  voice_profile_id: z.string().uuid().nullable().default(null),
  character_id: z.string().uuid().nullable().default(null),
  mode: z.enum(MODES.values).default("auto"),
  own_idea: text(4000).default(""),
  template_id: z.string().uuid().nullable().default(null),
  instructions: text(2000).default(""),
});
export type ProjectSettings = z.infer<typeof projectSettings>;

// ───── مخرجات المخرج الإبداعي ─────
// هذا المخطط هو العقد مع نموذج اللغة: يُتحقق منه قبل الحفظ، والنقص يُصلَّح أو يُرفض برسالة واضحة.
export const directorScene = z.object({
  title: text(120).min(1),
  duration_s: z.number().min(0.5).max(60),
  visual_prompt: text(3000).min(1),
  negative_prompt: text(1000).default(""),
  camera: text(500).default(""),
  lighting: text(500).default(""),
  on_screen_text: text(300).default(""),
  voiceover: text(1000).default(""),
  sfx: text(300).default(""),
  transition: z.enum(TRANSITIONS.values).default("cut"),
  editing_notes: text(1000).default(""),
  continuity: text(1000).default(""),
  reference_asset_ids: z.array(z.string().uuid()).default([]),
});

export const directorOutput = z.object({
  campaign_name: text(160).min(1),
  core_idea: text(1000).min(1),
  marketing_message: text(1000).min(1),
  target_audience: text(500).default(""),
  hook: text(500).min(1),
  voiceover_script: text(4000).default(""),
  cta: text(300).min(1),
  continuity_requirements: text(1500).default(""),
  editing_instructions: text(1500).default(""),
  scenes: z.array(directorScene).min(1).max(20),
});
export type DirectorOutput = z.infer<typeof directorOutput>;

export const ideaList = z.object({
  ideas: z.array(z.object({ title: text(120).min(1), pitch: text(600).min(1), hook: text(300).default("") })).min(1).max(6),
});

// ───── المشهد كما يُعدَّل في المحرر ─────
// بلا قيم افتراضية عمدًا: التحديث الجزئي يجب ألا يمسح الحقول غير المرسلة
export const sceneUpdate = z.object({
  title: text(120).min(1).optional(),
  visual_prompt: text(3000).optional(),
  negative_prompt: text(1000).optional(),
  camera: text(500).optional(),
  lighting: text(500).optional(),
  on_screen_text: text(300).optional(),
  voiceover: text(1000).optional(),
  sfx: text(300).optional(),
  transition: z.enum(TRANSITIONS.values).optional(),
  editing_notes: text(1000).optional(),
  continuity: text(1000).optional(),
  reference_asset_ids: z.array(z.string().uuid()).max(10).optional(),
  duration_ms: z.number().int().min(500).max(60000).optional(),
  source_type: z.enum(["generate", "upload", "none"]).optional(),
  selected_asset_id: z.string().uuid().nullable().optional(),
  trim_start_ms: z.number().int().min(0).optional(),
  version: z.number().int().positive(),
});

// ───── خط المونتاج الزمني ─────
export const textStyle = z.object({
  font: z.enum(["IBM Plex Sans Arabic", "Noto Kufi Arabic"]).default("IBM Plex Sans Arabic"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFFFFF"),
  box: z.boolean().default(true),
  position: z.enum(["top", "center", "bottom"]).default("bottom"),
  size: z.number().int().min(24).max(140).default(64),
});

export const timelineData = z.object({
  aspect: z.enum(ASPECTS).default("9:16"),
  voice_volume: z.number().min(0).max(2).default(1),
  music_asset_id: z.string().uuid().nullable().default(null),
  music_volume: z.number().min(0).max(1).default(0.25),
  duck_music: z.boolean().default(true),
  subtitles: z.boolean().default(true),
  text_style: textStyle.default(textStyle.parse({})),
  logo: z
    .object({
      asset_id: z.string().uuid().nullable().default(null),
      position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]).default("top-right"),
      scale: z.number().min(0.05).max(0.5).default(0.18),
    })
    .default({ asset_id: null, position: "top-right", scale: 0.18 }),
  scene_volume: z.number().min(0).max(2).default(0),
});
export type TimelineData = z.infer<typeof timelineData>;
