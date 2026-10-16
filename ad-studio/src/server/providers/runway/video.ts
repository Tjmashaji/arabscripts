// توليد الفيديو عبر Runway باستخدام SDK الرسمي (@runwayml/sdk).
// image_to_video عند توفر صورة مرجعية، وtext_to_video بدونها. التوليد غير متزامن: إرسال ثم استعلام.
import RunwayML from "@runwayml/sdk";
import type { Aspect } from "@/lib/domain";
import { ProviderError, type AsyncGenerationProvider, type GenerationRequest, type PollResult } from "../types";

const I2V_RATIO: Record<Aspect, "720:1280" | "1280:720" | "960:960" | "832:1104"> = {
  "9:16": "720:1280", "16:9": "1280:720", "1:1": "960:960", "4:5": "832:1104",
};
// text_to_video في gen4.5 يدعم 16:9 و9:16 فقط؛ المقاسات الأخرى تُقص في المونتاج
const T2V_RATIO: Record<Aspect, "720:1280" | "1280:720"> = { "9:16": "720:1280", "16:9": "1280:720", "1:1": "720:1280", "4:5": "720:1280" };

function mapError(e: unknown): never {
  if (e instanceof RunwayML.RateLimitError) throw new ProviderError(e.message, true, "خدمة الفيديو مزدحمة. ستُعاد المحاولة تلقائيًا.");
  if (e instanceof RunwayML.AuthenticationError) throw new ProviderError(e.message, false, "مفتاح Runway غير صالح. راجع الإعدادات.");
  if (e instanceof RunwayML.BadRequestError) throw new ProviderError(e.message, false, "رفضت خدمة الفيديو الطلب (قد يكون الوصف أو الصورة غير مقبولين).");
  if (e instanceof RunwayML.APIConnectionError) throw new ProviderError(e.message, true, "تعذّر الاتصال بخدمة الفيديو. ستُعاد المحاولة.");
  if (e instanceof RunwayML.APIError) throw new ProviderError(e.message, (e.status ?? 500) >= 500, "حدث خطأ لدى خدمة الفيديو.");
  throw e;
}

export class RunwayVideo implements AsyncGenerationProvider {
  info = { id: "runway", label: "Runway", mode: "live" as const };
  capabilities = { aspects: ["9:16", "16:9", "1:1", "4:5"] as Aspect[], durations: [2, 3, 4, 5, 6, 7, 8, 9, 10], supportsReferenceImage: true, requiresReferenceImage: false };
  private client: RunwayML;

  constructor(apiKey: string, private imageModel: string, private textModel: string, private centsPerCredit: number) {
    this.client = new RunwayML({ apiKey, maxRetries: 2 });
  }

  async submit(req: GenerationRequest) {
    const duration = Math.min(10, Math.max(2, Math.round(req.durationS)));
    const promptText = req.prompt.slice(0, 1000);
    try {
      const res = req.referenceImage
        ? await this.client.imageToVideo.create({
            model: this.imageModel as "gen4.5",
            promptImage: "dataUri" in req.referenceImage ? req.referenceImage.dataUri : req.referenceImage.url,
            promptText,
            ratio: I2V_RATIO[req.aspect],
            duration,
            ...(req.seed !== undefined ? { seed: req.seed } : {}),
          })
        : await this.client.textToVideo.create({
            model: this.textModel as "gen4.5",
            promptText,
            ratio: T2V_RATIO[req.aspect],
            duration,
            ...(req.seed !== undefined ? { seed: req.seed } : {}),
          });
      // تقدير Runway هو الحد الأقصى؛ يُسجَّل كتقدير
      const credits = (res as { estimatedCost?: { credits?: number } }).estimatedCost?.credits;
      return { providerJobId: res.id, estimatedCost: { costCents: credits !== undefined ? Math.ceil(credits * this.centsPerCredit) : null, costIsEstimate: true } };
    } catch (e) {
      return mapError(e);
    }
  }

  async poll(id: string): Promise<PollResult> {
    try {
      const t = await this.client.tasks.retrieve(id);
      switch (t.status) {
        case "PENDING":
        case "THROTTLED":
          return { state: "pending", progress: null, label: t.status === "THROTTLED" ? "في طابور المزود" : "في الانتظار لدى المزود" };
        case "RUNNING":
          return { state: "running", progress: typeof t.progress === "number" ? Math.round(t.progress * 100) : null, label: "يُولَّد الآن" };
        case "SUCCEEDED":
          if (!t.output?.length) return { state: "failed", error: "لم يُرجع المزود ملف الفيديو.", retryable: true };
          return { state: "succeeded", output: { url: t.output[0], mime: "video/mp4" }, cost: { costCents: null, costIsEstimate: true } };
        case "FAILED":
          return { state: "failed", error: `فشل التوليد لدى Runway${t.failureCode ? ` (${t.failureCode})` : ""}.`, retryable: Boolean(t.failureCode?.startsWith("INTERNAL")) };
        case "CANCELLED":
          return { state: "cancelled", error: "أُلغيت المهمة لدى المزود.", retryable: false };
      }
    } catch (e) {
      return mapError(e);
    }
  }

  async cancel(id: string) {
    try {
      await this.client.tasks.delete(id);
    } catch (e) {
      if (e instanceof RunwayML.NotFoundError) return;
      mapError(e);
    }
  }
}
