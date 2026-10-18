// واجهات موحدة لمزودي الذكاء الاصطناعي. منطق التطبيق يتعامل مع هذه الواجهات فقط،
// وكل مزود له محوّل مستقل يمكن استبداله دون إعادة كتابة التطبيق (انظر AI_PROVIDERS.md).
import type { Aspect, DirectorOutput, ProjectSettings } from "@/lib/domain";

// live: خدمة حقيقية مدفوعة. simulation: محاكاة تطويرية، مخرجاتها موسومة ولا تُعرض كنتيجة حقيقية.
export type ProviderMode = "live" | "simulation";

export type ProviderInfo = {
  id: string;
  label: string;
  mode: ProviderMode;
  // خدمة حقيقية بلا تكلفة ولا مفتاح (مثل تقسيم نص المستخدم أو أصوات Edge)
  free?: boolean;
  // ما يحتاجه المشغّل لتفعيل الخدمة الحقيقية (يظهر في صفحة الإعدادات)
  setup?: string;
};

export type Cost = { costCents: number | null; costIsEstimate: boolean };

// ───── المخرج الإبداعي ─────
export type DirectorBrief = {
  business: {
    name: string;
    business_type: string;
    description: string;
    audience: string;
    city: string;
    differentiator: string;
    offer: string;
    contact: string;
  };
  settings: ProjectSettings;
  // ملخصات تحليل الوسائط المرفوعة فعليًا (لا يُضاف ما لم يُحلَّل)
  assets: { id: string; kind: string; role: string; name: string; description?: string }[];
  template?: { name: string; base_prompt: string; negative_prompt: string; scene_plan: { title: string; duration_s: number; goal: string }[]; editing_notes: string };
  chosen_idea?: { title: string; pitch: string };
  // الشخصية المحفوظة (للاستمرارية البصرية بين المشاهد)
  character?: { name: string; type: string; presentation_style: string; appearance: string; wardrobe: string };
};

export interface DirectorProvider {
  info: ProviderInfo;
  ideas(brief: DirectorBrief): Promise<{ ideas: { title: string; pitch: string; hook: string }[] } & Cost>;
  direct(brief: DirectorBrief): Promise<{ output: DirectorOutput; model: string } & Cost>;
}

// ───── تحليل الوسائط ─────
export type AnalysisImage = { mime: "image/jpeg" | "image/png" | "image/webp"; base64: string };
export type MediaAnalysis = { description: string; tags: string[]; suggested_use: string; on_screen_text_detected: string };

export interface MediaAnalysisProvider {
  info: ProviderInfo;
  analyze(images: AnalysisImage[], context: { kind: string; role: string; business: string }): Promise<{ analysis: MediaAnalysis } & Cost>;
}

// ───── توليد الفيديو والصور (غير متزامن) ─────
export type GenerationRequest = {
  prompt: string;
  negativePrompt?: string;
  aspect: Aspect;
  durationS: number;
  // صورة مرجعية كـ data URI أو رابط عام مؤقت
  referenceImage?: { dataUri: string } | { url: string };
  seed?: number;
  label: string;
};

export type PollResult =
  | { state: "pending" | "running"; progress: number | null; label: string }
  | { state: "succeeded"; output: { url?: string; localFile?: string; mime: string }; cost: Cost }
  | { state: "failed" | "cancelled"; error: string; retryable: boolean };

export type GenerationCapabilities = {
  aspects: Aspect[];
  durations: number[];
  supportsReferenceImage: boolean;
  requiresReferenceImage: boolean;
};

export interface AsyncGenerationProvider {
  info: ProviderInfo;
  capabilities: GenerationCapabilities;
  submit(req: GenerationRequest): Promise<{ providerJobId: string; estimatedCost?: Cost }>;
  poll(providerJobId: string): Promise<PollResult>;
  cancel?(providerJobId: string): Promise<void>;
}
export type VideoGenerationProvider = AsyncGenerationProvider;
export type ImageGenerationProvider = AsyncGenerationProvider;

// ───── الصوت ─────
export type VoiceOption = { id: string; name: string; gender: "male" | "female" | "neutral"; languages: string[]; previewUrl?: string; note?: string };

export interface SpeechGenerationProvider {
  info: ProviderInfo;
  // اللهجات التي يُعتمد عليها فعليًا لدى المزود (لا نعرض غيرها كأنها مدعومة)
  dialects: string[];
  voices(): Promise<VoiceOption[]>;
  synthesize(req: { text: string; voiceId: string; speed: number; tone: string }): Promise<{ audio: Buffer; mime: string; ext: string } & Cost>;
}

// خطأ من المزود: retryable يحدد هل تعيد سياسة المحاولة التشغيل
export class ProviderError extends Error {
  constructor(message: string, public retryable: boolean, public userMessage: string) {
    super(message);
  }
}
