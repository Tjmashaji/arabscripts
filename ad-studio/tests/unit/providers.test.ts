// محولات المزودين مع شبكة مُحاكاة: نتحقق من شكل الطلبات وتحويل الردود والأخطاء، بلا مفاتيح حقيقية.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeDirector } from "@/server/providers/anthropic/director";
import { ElevenLabsSpeech } from "@/server/providers/elevenlabs/speech";
import { RunwayVideo } from "@/server/providers/runway/video";
import { ProviderError } from "@/server/providers/types";
import { projectSettings } from "@/lib/domain";

type Call = { url: string; init: RequestInit & { headers?: Headers | Record<string, string> } };
function mockFetch(responder: (c: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const c = { url: String(url instanceof Request ? url.url : url), init: (init ?? {}) as Call["init"] };
    calls.push(c);
    return responder(c);
  }));
  return calls;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const header = (c: Call, name: string) => (c.init.headers instanceof Headers ? c.init.headers.get(name) : Object.entries(c.init.headers ?? {}).find(([k]) => k.toLowerCase() === name)?.[1]);

afterEach(() => vi.unstubAllGlobals());

const brief = {
  business: { name: "مطعم الجمر", business_type: "restaurant_cafe", description: "مشويات", audience: "", city: "الرياض", differentiator: "", offer: "", contact: "" },
  settings: projectSettings.parse({ duration_s: 30 }),
  assets: [{ id: "11111111-1111-4111-8111-111111111111", kind: "image", role: "place", name: "p.jpg", description: "واجهة المطعم" }],
};

describe("Claude (المخرج الإبداعي)", () => {
  it("يرسل طلبًا منظمًا بالنموذج والخطة البديلة ويصحح المخرجات", async () => {
    const plan = { campaign_name: "حملة", core_idea: "فكرة", marketing_message: "رسالة", target_audience: "", hook: "خطاف", voiceover_script: "", cta: "زورونا", continuity_requirements: "", editing_instructions: "",
      scenes: [1, 2, 3].map((i) => ({ title: `م${i}`, duration_s: 9, visual_prompt: "shot", negative_prompt: "", camera: "", lighting: "", on_screen_text: "", voiceover: "نص", sfx: "", transition: "fade", editing_notes: "", continuity: "", reference_asset_ids: ["11111111-1111-4111-8111-111111111111", "ghost"] })) };
    const calls = mockFetch(() => json({ id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: JSON.stringify(plan) }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 2000, output_tokens: 3000 } }));
    const r = await new ClaudeDirector("test-key", "claude-opus-5-5").direct(brief);
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toContain("/v1/messages");
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.fallbacks).toBe("default");
    expect(body.output_config.format.type).toBe("json_schema");
    expect(String(header(calls[0], "anthropic-beta"))).toContain("server-side-fallback-2026-07-01");
    expect(body.messages[0].content).toContain("<brief>");
    expect(body.messages[0].content).toContain("do not mention any offer or price");
    expect(r.output.scenes.reduce((a, s) => a + s.duration_s, 0)).toBe(30);
    expect(r.output.scenes[0].reference_asset_ids).toEqual(["11111111-1111-4111-8111-111111111111"]);
    // (2000×$4 + 3000×$20) / 1M = $0.068 → 7 سنتات (تقريبًا للأعلى)
    expect(r.costCents).toBe(7);
  });
  it("يحوّل رفض النموذج إلى خطأ واضح غير قابل لإعادة المحاولة", async () => {
    mockFetch(() => json({ id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: "refusal", stop_sequence: null, stop_details: { type: "refusal", category: null, explanation: "" }, usage: { input_tokens: 1, output_tokens: 1 } }));
    await expect(new ClaudeDirector("k", "claude-opus-5-5").ideas(brief)).rejects.toMatchObject({ retryable: false });
  });
  it("مفتاح غير صالح يعطي رسالة عربية ولا يُعاد", async () => {
    mockFetch(() => json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401));
    const e = await new ClaudeDirector("bad", "claude-opus-5-5").ideas(brief).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e.userMessage).toContain("Anthropic");
    expect(e.retryable).toBe(false);
  });
});

describe("Runway (توليد الفيديو)", () => {
  it("يختار image_to_video مع صورة مرجعية ويحوّل حالات المهمة", async () => {
    let status: Record<string, unknown> = { id: "task_1", status: "RUNNING", progress: 0.4, createdAt: "" };
    const calls = mockFetch((c) => (c.init.method === "POST" ? json({ id: "task_1", estimatedCost: { credits: 60 } }) : json(status)));
    const p = new RunwayVideo("k", "gen4.5", "gen4.5", 1);
    const sub = await p.submit({ prompt: "x".repeat(1200), aspect: "9:16", durationS: 4.6, referenceImage: { dataUri: "data:image/jpeg;base64,AAAA" }, label: "م1" });
    const body = JSON.parse(String(calls[0].init.body));
    expect(calls[0].url).toContain("/v1/image_to_video");
    expect(body).toMatchObject({ model: "gen4.5", ratio: "720:1280", duration: 5, promptImage: "data:image/jpeg;base64,AAAA" });
    expect(body.promptText).toHaveLength(1000);
    expect(sub).toEqual({ providerJobId: "task_1", estimatedCost: { costCents: 60, costIsEstimate: true } });
    expect(await p.poll("task_1")).toEqual({ state: "running", progress: 40, label: "يُولَّد الآن" });
    status = { id: "task_1", status: "SUCCEEDED", output: ["https://cdn.example/v.mp4"], createdAt: "" };
    expect(await p.poll("task_1")).toMatchObject({ state: "succeeded", output: { url: "https://cdn.example/v.mp4" } });
    status = { id: "task_1", status: "FAILED", failure: "x", failureCode: "SAFETY.INPUT", createdAt: "" };
    expect(await p.poll("task_1")).toMatchObject({ state: "failed", retryable: false });
  });
  it("بلا صورة مرجعية يستخدم text_to_video", async () => {
    const calls = mockFetch(() => json({ id: "t2" }));
    await new RunwayVideo("k", "gen4.5", "gen4.5", 1).submit({ prompt: "p", aspect: "16:9", durationS: 6, label: "x" });
    expect(calls[0].url).toContain("/v1/text_to_video");
    expect(JSON.parse(String(calls[0].init.body)).ratio).toBe("1280:720");
  });
});

describe("ElevenLabs (التعليق الصوتي)", () => {
  it("يرسل النص بالنموذج متعدد اللغات ويقدّر التكلفة بعدد الأحرف", async () => {
    const calls = mockFetch(() => new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } }));
    const r = await new ElevenLabsSpeech("k", "eleven_multilingual_v2", 30).synthesize({ text: "أهلًا".repeat(400), voiceId: "voice 1", speed: 1.1, tone: "energetic" });
    expect(calls[0].url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice%201?output_format=mp3_44100_128");
    expect(header(calls[0], "xi-api-key")).toBe("k");
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.model_id).toBe("eleven_multilingual_v2");
    expect(body.voice_settings.speed).toBe(1.1);
    expect(r.audio.length).toBe(6);
    expect(r.costCents).toBe(60);
    expect(r.costIsEstimate).toBe(true);
  });
  it("429 قابل لإعادة المحاولة و401 غير قابل", async () => {
    mockFetch(() => new Response("busy", { status: 429 }));
    await expect(new ElevenLabsSpeech("k", "m", 30).voices()).rejects.toMatchObject({ retryable: true });
    mockFetch(() => new Response("no", { status: 401 }));
    await expect(new ElevenLabsSpeech("k", "m", 30).voices()).rejects.toMatchObject({ retryable: false });
  });
});

describe("البدائل المجانية", () => {
  it("مخرج «نصك أنت» يقسّم سيناريو المستخدم دون وسم محاكاة، ويرفض الأفكار والكتابة الآلية برسالة واضحة", async () => {
    const { ManualDirector } = await import("@/server/providers/manual/director");
    const d = new ManualDirector();
    expect(d.info).toMatchObject({ mode: "live", free: true });
    const own = { ...brief, settings: projectSettings.parse({ duration_s: 30, mode: "own_idea", own_idea: "شوف وش لقينا! أجواء تفتح النفس. زورونا اليوم." }) };
    const r = await d.direct(own);
    expect(r.output.scenes.map((s) => s.voiceover).filter(Boolean).join(" ")).toBe("شوف وش لقينا! أجواء تفتح النفس. زورونا اليوم.");
    expect(r.output.scenes.reduce((a, s) => a + s.duration_s, 0)).toBe(30);
    await expect(d.ideas()).rejects.toMatchObject({ retryable: false });
    await expect(d.direct(brief)).rejects.toBeInstanceOf(ProviderError);
  });

  it("السجل يختار المخرج المجاني لنص المستخدم والصوت المجاني عند غياب المفاتيح", async () => {
    vi.resetModules();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("ALLOW_SIMULATION", "true");
    vi.stubEnv("FREE_TTS", "true");
    const reg = await import("@/server/providers/registry");
    expect(reg.directorProvider({ ownScript: true }).info.id).toBe("manual");
    expect(reg.directorProvider().info.mode).toBe("simulation");
    expect(reg.speechProvider()?.info).toMatchObject({ id: "edge-tts", mode: "live", free: true });
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
