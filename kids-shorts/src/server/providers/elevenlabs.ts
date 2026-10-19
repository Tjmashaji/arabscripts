// تحويل النص إلى صوت عبر ElevenLabs (نموذج متعدد اللغات يدعم العربية). الإيقاع أبطأ قليلًا ليناسب الأطفال.
import { ProviderError } from "./types";

const API = "https://api.elevenlabs.io/v1";

export class ElevenLabsVoice {
  constructor(private apiKey: string, private model: string, private voiceId: string) {}

  async synthesize(text: string): Promise<Buffer> {
    let res: Response;
    try {
      res = await fetch(`${API}/text-to-speech/${encodeURIComponent(this.voiceId)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": this.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({
          text,
          model_id: this.model,
          voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 0.9 },
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      throw new ProviderError(String(e), true, "تعذّر الاتصال بخدمة الصوت. ستُعاد المحاولة.");
    }
    if (res.status === 401) throw new ProviderError("401", false, "مفتاح ElevenLabs غير صالح. راجع الإعدادات.");
    if (res.status === 404) throw new ProviderError("404", false, "معرّف الصوت (ELEVENLABS_VOICE_ID) غير موجود في حسابك.");
    if (res.status === 429) throw new ProviderError("429", true, "خدمة الصوت مزدحمة. ستُعاد المحاولة.");
    if (!res.ok) throw new ProviderError(`${res.status} ${await res.text().catch(() => "")}`, res.status >= 500, "رفضت خدمة الصوت الطلب.");
    return Buffer.from(await res.arrayBuffer());
  }
}
