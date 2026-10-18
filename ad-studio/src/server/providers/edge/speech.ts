// تعليق صوتي مجاني بلا مفتاح: أصوات Microsoft العصبية العربية عبر مكتبة edge-tts مفتوحة المصدر.
// يستخدم خدمة «القراءة بصوت عالٍ» في متصفح Edge، وهي غير رسمية: قد تتوقف أو تتغير دون إشعار،
// وشروط استخدامها التجاري غير محددة. للاستخدام التجاري المضمون استخدم ElevenLabs أو Azure Speech.
import { spawn } from "node:child_process";
import path from "node:path";
import { ProviderError, type SpeechGenerationProvider, type VoiceOption } from "../types";

const VOICES: VoiceOption[] = [
  { id: "ar-SA-HamedNeural", name: "حامد (سعودي)", gender: "male", languages: ["ar-SA"], note: "فصحى بلكنة سعودية" },
  { id: "ar-SA-ZariyahNeural", name: "زارية (سعودية)", gender: "female", languages: ["ar-SA"], note: "فصحى بلكنة سعودية" },
  { id: "ar-AE-HamdanNeural", name: "حمدان (إماراتي)", gender: "male", languages: ["ar-AE"], note: "فصحى بلكنة خليجية" },
  { id: "ar-AE-FatimaNeural", name: "فاطمة (إماراتية)", gender: "female", languages: ["ar-AE"], note: "فصحى بلكنة خليجية" },
  { id: "ar-KW-FahedNeural", name: "فهد (كويتي)", gender: "male", languages: ["ar-KW"], note: "فصحى بلكنة خليجية" },
  { id: "ar-KW-NouraNeural", name: "نورة (كويتية)", gender: "female", languages: ["ar-KW"], note: "فصحى بلكنة خليجية" },
  { id: "ar-EG-ShakirNeural", name: "شاكر (مصري)", gender: "male", languages: ["ar-EG"], note: "فصحى بلكنة مصرية" },
  { id: "ar-EG-SalmaNeural", name: "سلمى (مصرية)", gender: "female", languages: ["ar-EG"], note: "فصحى بلكنة مصرية" },
];

const TONE_RATE: Record<string, number> = { calm: -5, fast: 10, energetic: 8, luxury: -8 };
const signed = (n: number, unit: string) => `${n >= 0 ? "+" : ""}${Math.round(n)}${unit}`;

export class EdgeSpeech implements SpeechGenerationProvider {
  info = { id: "edge-tts", label: "أصوات Microsoft (مجانية)", mode: "live" as const, free: true };
  dialects = ["ar_msa", "ar_sa", "ar_gulf", "ar_eg"];

  async voices() {
    return VOICES;
  }

  async synthesize(req: { text: string; voiceId: string; speed: number; tone: string }) {
    // معرّف صوت من مزود آخر (مثل أصوات المحاكاة) يُستبدل بالصوت السعودي حسب الجنس
    const voice = VOICES.find((v) => v.id === req.voiceId)?.id ?? (/female/.test(req.voiceId) ? "ar-SA-ZariyahNeural" : "ar-SA-HamedNeural");
    const rate = Math.max(-50, Math.min(100, (req.speed - 1) * 100 + (TONE_RATE[req.tone] ?? 0)));
    const audio = await run({ text: req.text, voice, rate: signed(rate, "%"), pitch: "+0Hz" });
    return { audio, mime: "audio/mpeg", ext: "mp3", costCents: 0, costIsEstimate: false };
  }
}

function run(input: object): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.PYTHON_BIN || "python3", [path.join(process.cwd(), "scripts", "edge_tts_say.py")], { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), 90_000);
    p.stdout.on("data", (d: Buffer) => out.push(d));
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(new ProviderError(String(e), false, "خدمة الصوت المجانية غير مثبتة على الخادم (python3 وedge-tts)."));
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.length) return resolve(Buffer.concat(out));
      // أغلب الأعطال هنا مؤقتة (شبكة أو ازدحام)، فتُعاد المحاولة
      reject(new ProviderError(`edge-tts exit ${code}: ${err.slice(-500)}`, true, "تعذّر توليد الصوت المجاني الآن. ستُعاد المحاولة."));
    });
    p.stdin.end(JSON.stringify(input));
  });
}
