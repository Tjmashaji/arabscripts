// مخرج إبداعي للمحاكاة التطويرية: يبني خطة إنتاج حتمية من بيانات المستخدم وحدها
// (لا يستدعي أي نموذج ولا يخترع معلومات). مخرجاته موسومة "محاكاة" في الواجهة.
import { STYLES, type DirectorOutput } from "@/lib/domain";

const EN_TYPE: Record<string, string> = { restaurant_cafe: "restaurant or cafe", real_estate: "real estate", perfume_beauty: "perfume and beauty", fashion: "fashion store", ecommerce: "online store", automotive: "automotive", professional_services: "professional services", tourism_hospitality: "hospitality", other: "local" };
const EN_STYLE: Record<string, string> = { trendy: "trendy social-media", cinematic: "cinematic", luxury: "luxury", realistic: "realistic", comedy: "light comedic", story: "storytelling", emotional: "emotional", documentary: "documentary", direct_sale: "direct-response" };
import { fitDurations } from "../repair";
import type { DirectorBrief, DirectorProvider } from "../types";

const DEFAULT_PLANS: Record<string, { title: string; share: number; goal: string; camera: string }[]> = {
  short: [
    { title: "الخطاف", share: 0.27, goal: "attention-grabbing opening shot", camera: "fast push-in" },
    { title: "المنتج", share: 0.4, goal: "hero shots of the product or service", camera: "slow orbit" },
    { title: "الدعوة", share: 0.33, goal: "brand moment and call to action", camera: "steady wide shot" },
  ],
  medium: [
    { title: "خطاف بصري", share: 4, goal: "attention-grabbing opening shot", camera: "fast whip pan into a close-up" },
    { title: "الأجواء", share: 5, goal: "atmosphere of the place", camera: "smooth gimbal walk-through" },
    { title: "لقطات المنتج", share: 7, goal: "detailed close-ups of the product", camera: "macro slider shots" },
    { title: "التجربة", share: 8, goal: "the customer experience", camera: "handheld medium shots" },
    { title: "الشعار والدعوة", share: 6, goal: "brand logo moment and call to action", camera: "slow pull-back" },
  ],
};

// تقسيم النص إلى جمل مع إبقاء علامات الترقيم
function sentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!؟?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

// توزيع الجمل على المشاهد بالتتابع حسب مدة كل مشهد (حوالي 2.3 كلمة في الثانية)
export function distributeScript(script: string[], durations: number[]): string[] {
  const out = durations.map(() => [] as string[]);
  const total = script.reduce((a, s) => a + words(s), 0) || 1;
  const sumD = durations.reduce((a, b) => a + b, 0);
  let i = 0, used = 0, budget = (durations[0] / sumD) * total;
  for (const s of script) {
    while (i < durations.length - 1 && used >= budget - 0.5) {
      i++;
      budget += (durations[i] / sumD) * total;
    }
    out[i].push(s);
    used += words(s);
  }
  return out.map((x) => x.join(" "));
}

export class SimulationDirector implements DirectorProvider {
  info = { id: "simulation", label: "محاكاة تطويرية", mode: "simulation" as const, setup: "أضف ANTHROPIC_API_KEY لتفعيل المخرج الإبداعي الحقيقي." };

  async ideas(brief: DirectorBrief) {
    const b = brief.business;
    const style = STYLES.label[brief.settings.style];
    return {
      ideas: [
        { title: `يوم في ${b.name}`, pitch: `جولة ${style} تعرض ${b.name} من الداخل كما هو، بلقطات من المواد المرفوعة.`, hook: `تعرف ${b.name}؟` },
        { title: "قبل وبعد", pitch: `مقارنة سريعة بين المشكلة التي يواجهها الجمهور والحل الذي يقدمه ${b.name}.`, hook: b.audience ? `لـ${b.audience}…` : "لحظة…" },
        { title: "التفاصيل تتكلم", pitch: `لقطات قريبة جدًا للتفاصيل مع تعليق قصير يبرز ${b.differentiator || "ما يميز النشاط"}.`, hook: "شوف التفاصيل…" },
      ],
      costCents: 0,
      costIsEstimate: false,
    };
  }

  async direct(brief: DirectorBrief): Promise<{ output: DirectorOutput; model: string; costCents: number; costIsEstimate: boolean }> {
    const b = brief.business;
    const s = brief.settings;
    const plan = brief.template?.scene_plan.length
      ? brief.template.scene_plan.map((p) => ({ title: p.title, share: p.duration_s, goal: p.goal, camera: "" }))
      : DEFAULT_PLANS[s.duration_s <= 15 ? "short" : "medium"];
    const durations = fitDurations(plan.map((p) => p.share), s.duration_s);
    const fill = (t: string) => t.replace(/\[(اسم المطعم|اسم النشاط|اسم المحل|الاسم)\]/g, b.name);
    const userScript = s.mode === "own_idea" && s.own_idea.trim() ? sentences(fill(s.own_idea)) : [];
    const voice = userScript.length
      ? distributeScript(userScript, durations)
      : plan.map((_, i) => (i === 0 ? (b.description ? b.description.split(/[.،]/)[0] : b.name) : i === plan.length - 1 ? `${b.name}${b.contact ? `. ${b.contact}` : ""}` : ""));
    // البرومبت المرئي بالإنجليزية بالكامل لنماذج الفيديو
    const typeLabel = EN_TYPE[b.business_type] ?? "local";
    const styleLabel = EN_STYLE[s.style] ?? s.style;
    const imgs = brief.assets.filter((a) => a.kind !== "audio");
    const output: DirectorOutput = {
      campaign_name: `${b.name} — ${STYLES.label[s.style]}`,
      core_idea: brief.chosen_idea?.pitch ?? (userScript.length ? "تنفيذ فكرة المستخدم كما كتبها مقسّمة على المشاهد." : `عرض ${b.name} بأسلوب ${STYLES.label[s.style]}.`),
      marketing_message: b.differentiator || b.description || b.name,
      target_audience: b.audience,
      hook: userScript[0] ?? voice[0] ?? b.name,
      voiceover_script: voice.filter(Boolean).join(" "),
      cta: b.contact ? `${b.name} — ${b.contact}` : b.name,
      continuity_requirements: ["نفس لوحة الألوان والإضاءة في كل المشاهد.", brief.character ? `الشخصية «${brief.character.name}»: ${brief.character.appearance} ${brief.character.wardrobe}`.trim() : ""].filter(Boolean).join(" "),
      editing_instructions: brief.template?.editing_notes ?? "قطع سريع على الإيقاع، والنصوص العربية تضاف في المونتاج.",
      scenes: plan.map((p, i) => ({
        title: p.title,
        duration_s: durations[i],
        visual_prompt: `${p.goal} for a ${typeLabel} business, ${styleLabel} style, ${s.aspect === "16:9" ? "horizontal" : "vertical"} framing, natural light, no text in frame`,
        negative_prompt: "text, watermark, logo, distorted hands, extra fingers",
        camera: p.camera,
        lighting: "",
        on_screen_text: i === 0 ? (userScript[0] ?? "").split(" ").slice(0, 5).join(" ") : i === plan.length - 1 ? b.name : "",
        voiceover: voice[i] ?? "",
        sfx: "",
        transition: i === 0 ? "cut" : "fade",
        editing_notes: "",
        continuity: "",
        reference_asset_ids: imgs.length ? [imgs[i % imgs.length].id] : [],
      })),
    };
    return { output, model: "simulation", costCents: 0, costIsEstimate: false };
  }
}
