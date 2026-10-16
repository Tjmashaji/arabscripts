// اختيار المزود: الخدمة الحقيقية عند وجود مفتاحها، وإلا المحاكاة إذا كانت مسموحة، وإلا "غير متصل".
import { env } from "../env";
import { ClaudeDirector } from "./anthropic/director";
import { ElevenLabsSpeech } from "./elevenlabs/speech";
import { RunwayVideo } from "./runway/video";
import { SimulationDirector } from "./simulation/director";
import { simulationImage, simulationSpeech, simulationVideo } from "./simulation/media";
import type { AsyncGenerationProvider, DirectorProvider, MediaAnalysisProvider, SpeechGenerationProvider } from "./types";

export type Capability = "director" | "analysis" | "video" | "image" | "speech";

export type CapabilityStatus = {
  capability: Capability;
  label: string;
  state: "live" | "simulation" | "unavailable";
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

export function directorProvider(): DirectorProvider | undefined {
  return claude() ?? (env().simulationAllowed ? new SimulationDirector() : undefined);
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

export function speechProvider(): SpeechGenerationProvider | undefined {
  const e = env();
  if (e.ELEVENLABS_API_KEY) return new ElevenLabsSpeech(e.ELEVENLABS_API_KEY, e.ELEVENLABS_MODEL, e.ELEVENLABS_CENTS_PER_1K_CHARS);
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
  director: "أضف ANTHROPIC_API_KEY",
  analysis: "أضف ANTHROPIC_API_KEY (لا توجد محاكاة للتحليل)",
  video: "أضف RUNWAY_API_KEY",
  image: "لا يوجد مزود صور حقيقي مدمج بعد",
  speech: "أضف ELEVENLABS_API_KEY",
};

export function capabilityStatus(): CapabilityStatus[] {
  return (Object.keys(LABELS) as Capability[]).map((cap) => {
    const p = providerFor(cap);
    if (!p) return { capability: cap, label: LABELS[cap], state: "unavailable", provider: "—", setup: SETUP[cap] };
    return { capability: cap, label: LABELS[cap], state: p.info.mode, provider: p.info.label, setup: p.info.mode === "simulation" ? SETUP[cap] : undefined };
  });
}
