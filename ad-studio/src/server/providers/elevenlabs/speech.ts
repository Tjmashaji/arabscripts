// تحويل النص إلى صوت عبر ElevenLabs REST API (نموذج متعدد اللغات يدعم العربية).
// ملاحظة: اللهجة الناتجة تعتمد على الصوت المختار؛ لا نعد بلهجة سعودية لكل صوت.
import { ProviderError, type SpeechGenerationProvider, type VoiceOption } from "../types";

const API = "https://api.elevenlabs.io/v1";
const TONE: Record<string, { stability: number; style: number }> = {
  calm: { stability: 0.7, style: 0.1 }, fast: { stability: 0.5, style: 0.3 }, energetic: { stability: 0.35, style: 0.6 }, luxury: { stability: 0.75, style: 0.25 },
};

export class ElevenLabsSpeech implements SpeechGenerationProvider {
  info = { id: "elevenlabs", label: "ElevenLabs", mode: "live" as const };
  dialects = ["ar_msa", "ar_sa", "ar_gulf", "ar_eg"];
  constructor(private apiKey: string, private model: string, private centsPer1kChars: number) {}

  private async call(path: string, init: RequestInit) {
    let res: Response;
    try {
      res = await fetch(`${API}${path}`, { ...init, headers: { "xi-api-key": this.apiKey, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(120_000) });
    } catch (e) {
      throw new ProviderError(String(e), true, "تعذّر الاتصال بخدمة الصوت. ستُعاد المحاولة.");
    }
    if (res.status === 401) throw new ProviderError("401", false, "مفتاح ElevenLabs غير صالح. راجع الإعدادات.");
    if (res.status === 429) throw new ProviderError("429", true, "خدمة الصوت مزدحمة. ستُعاد المحاولة.");
    if (!res.ok) throw new ProviderError(`${res.status} ${await res.text().catch(() => "")}`, res.status >= 500, "رفضت خدمة الصوت الطلب.");
    return res;
  }

  async voices(): Promise<VoiceOption[]> {
    const res = await this.call("/voices", { method: "GET" });
    const j = (await res.json()) as { voices: { voice_id: string; name: string; preview_url?: string; labels?: Record<string, string> }[] };
    return j.voices.map((v) => ({
      id: v.voice_id,
      name: v.name,
      gender: v.labels?.gender === "female" ? "female" : v.labels?.gender === "male" ? "male" : "neutral",
      languages: [v.labels?.language ?? v.labels?.accent ?? "multilingual"],
      previewUrl: v.preview_url,
      note: v.labels?.accent ? `اللكنة: ${v.labels.accent}` : undefined,
    }));
  }

  async synthesize(req: { text: string; voiceId: string; speed: number; tone: string }) {
    const t = TONE[req.tone] ?? TONE.calm;
    const res = await this.call(`/text-to-speech/${encodeURIComponent(req.voiceId)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text: req.text,
        model_id: this.model,
        voice_settings: { stability: t.stability, similarity_boost: 0.8, style: t.style, use_speaker_boost: true, speed: req.speed },
      }),
    });
    const audio = Buffer.from(await res.arrayBuffer());
    // التكلفة تقدير حسب عدد الأحرف وسعر خطتك (ELEVENLABS_CENTS_PER_1K_CHARS)
    return { audio, mime: "audio/mpeg", ext: "mp3", costCents: Math.ceil((req.text.length / 1000) * this.centsPer1kChars), costIsEstimate: true };
  }
}
