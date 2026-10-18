// اختيار المزود: الخدمة الحقيقية عند وجود مفتاحها، ثم البديل المجاني إن وُجد، ثم المحاكاة إذا كانت مسموحة، وإلا "غير متصل".
import { env } from "../env";
import { ClaudeDirector } from "./anthropic/director";
import { EdgeSpeech } from "./edge/speech";
import { ElevenLabsSpeech } from "./elevenlabs/speech";
import { ManualDirector } from "./manual/director";
import { RunwayVideo } from "./runway/video";
import { SimulationDirector } from "./simulation/director";
import { simulationImage, simulationSpeech, simulationVideo } from "./simulation/media";
import type { AsyncGenerationProvider, DirectorProvider, MediaAnalysisProvider, SpeechGenerationProvider } from "./types";

export type Capability = "director" | "analysis" | "video" | "image" | "speech";

export type CapabilityStatus = {
  capability: Capability;
  label: string;
  state: "live" | "simulation" | "unavailable";
  free?: boolean;
  provider: string;
  setup?: string;
};

let director: ClaudeDirector | undefined;
function claude() {
  const e = env();
  if (!e.ANTHROPIC_API_KEY) return undefined;
  director ??= new ClaudeDirector(e.ANTHROPIC_API_KEY, e.ANTHROPIC_MODEL);
  return director;
}

const manual = new ManualDirector();

// ownScript: المستخدم كتب السيناريو بنفسه، فيُقسَّم مجانًا ودون وسم محاكاة لأن الكلام كلامه
export function directorProvider(opts: { ownScript?: boolean } = {}): DirectorProvider {
  const c = claude();
  if (c) return c;
  if (opts.ownScript || !env().simulationAllowed) return manual;
  return new SimulationDirector();
}

export function directorById(id: string): DirectorProvider {
  return id === manual.info.id ? manual : directorProvider();
}

// لا توجد محاكاة لتحليل الوسائط: لا ندّعي تحليل ملف لم يُحلَّل فعليًا
export function analysisProvider(): MediaAnalysisProvider | undefined {
  return claude();
}

export function videoProvider(): AsyncGenerationProvider | undefined {
  const e = env();
  if (e.RUNWAY_API_KEY) return new RunwayVideo(e.RUNWAY_API_KEY, e.RUNWAY_MODEL, e.RUNWAY_MODEL_TEXT, e.RUNWAY_CENTS_PER_CREDIT);
  return e.simulationAllowed ? simulationVideo : undefined;
}

export function imageProvider(): AsyncGenerationProvider | undefined {
  return env().simulationAllowed ? simulationImage : undefined;
}

let edge: EdgeSpeech | undefined;
export function speechProvider(): SpeechGenerationProvider | undefined {
  const e = env();
  if (e.ELEVENLABS_API_KEY) return new ElevenLabsSpeech(e.ELEVENLABS_API_KEY, e.ELEVENLABS_MODEL, e.ELEVENLABS_CENTS_PER_1K_CHARS);
  if (e.FREE_TTS === "true") return (edge ??= new EdgeSpeech());
  return e.simulationAllowed ? simulationSpeech : undefined;
}

export function providerFor(cap: Capability) {
  return { director: directorProvider, analysis: analysisProvider, video: videoProvider, image: imageProvider, speech: speechProvider }[cap]();
}

const LABELS: Record<Capability, string> = {
  director: "المخرج الإبداعي (الأفكار والسيناريو)",
  analysis: "تحليل الصور والمقاطع",
  video: "توليد الفيديو",
  image: "توليد الصور",
  speech: "التعليق الصوتي",
};
const SETUP: Record<Capability, string> = {
  director: "أضف ANTHROPIC_API_KEY لاقتراح الأفكار وكتابة السيناريو تلقائيًا",
  analysis: "أضف ANTHROPIC_API_KEY (لا توجد محاكاة للتحليل)",
  video: "أضف RUNWAY_API_KEY",
  image: "لا يوجد مزود صور حقيقي مدمج بعد",
  speech: "أضف ELEVENLABS_API_KEY لأصوات أعلى جودة وترخيص تجاري واضح",
};

export function capabilityStatus(): CapabilityStatus[] {
  return (Object.keys(LABELS) as Capability[]).map((cap) => {
    const p = providerFor(cap);
    if (!p) return { capability: cap, label: LABELS[cap], state: "unavailable", provider: "—", setup: SETUP[cap] };
    const setup = p.info.mode === "simulation" || p.info.free ? SETUP[cap] : undefined;
    return { capability: cap, label: LABELS[cap], state: p.info.mode, free: p.info.free, provider: p.info.label, setup };
  });
}
