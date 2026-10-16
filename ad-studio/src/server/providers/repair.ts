// تصحيح مخرجات المخرج الإبداعي قبل الحفظ: قص النصوص الطويلة، ضبط مجموع المدد على المدة المطلوبة،
// وإزالة أي مرجع لملف غير موجود. ما لا يمكن تصحيحه يُرفض برسالة واضحة بدل إسقاط المشروع.
import { directorOutput, TRANSITIONS, type DirectorOutput } from "@/lib/domain";
import { ProviderError } from "./types";

const LIMITS: Record<string, number> = {
  campaign_name: 160, core_idea: 1000, marketing_message: 1000, target_audience: 500, hook: 500, voiceover_script: 4000,
  cta: 300, continuity_requirements: 1500, editing_instructions: 1500,
  title: 120, visual_prompt: 3000, negative_prompt: 1000, camera: 500, lighting: 500, on_screen_text: 300, voiceover: 1000,
  sfx: 300, editing_notes: 1000, continuity: 1000,
};
const clip = (k: string, v: unknown) => (typeof v === "string" ? v.trim().slice(0, LIMITS[k] ?? 1000) : "");

// يوزّع المدة الكلية على المشاهد بنسبها، بدقة عُشر ثانية، والفرق يذهب للمشهد الأخير
export function fitDurations(durations: number[], total: number): number[] {
  const safe = durations.map((d) => (Number.isFinite(d) && d > 0 ? d : 1));
  const sum = safe.reduce((a, b) => a + b, 0);
  const scaled = safe.map((d) => Math.max(0.5, Math.round((d / sum) * total * 10) / 10));
  const diff = Math.round((total - scaled.reduce((a, b) => a + b, 0)) * 10) / 10;
  scaled[scaled.length - 1] = Math.max(0.5, Math.round((scaled[scaled.length - 1] + diff) * 10) / 10);
  return scaled;
}

export function repairDirectorOutput(raw: unknown, totalSeconds: number, knownAssets: Set<string>): DirectorOutput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const scenesRaw = Array.isArray(r.scenes) ? (r.scenes as Record<string, unknown>[]).slice(0, 20) : [];
  if (!scenesRaw.length) throw new ProviderError("no scenes", true, "لم يُرجع المخرج الإبداعي أي مشاهد. ستُعاد المحاولة.");
  const durations = fitDurations(scenesRaw.map((s) => Number(s.duration_s)), totalSeconds);
  const transitions = new Set<string>(TRANSITIONS.values);
  const fixed = {
    campaign_name: clip("campaign_name", r.campaign_name) || "حملة بدون اسم",
    core_idea: clip("core_idea", r.core_idea) || "—",
    marketing_message: clip("marketing_message", r.marketing_message) || "—",
    target_audience: clip("target_audience", r.target_audience),
    hook: clip("hook", r.hook) || clip("on_screen_text", scenesRaw[0]?.on_screen_text) || "—",
    voiceover_script: clip("voiceover_script", r.voiceover_script) || scenesRaw.map((s) => clip("voiceover", s.voiceover)).filter(Boolean).join(" "),
    cta: clip("cta", r.cta) || "—",
    continuity_requirements: clip("continuity_requirements", r.continuity_requirements),
    editing_instructions: clip("editing_instructions", r.editing_instructions),
    scenes: scenesRaw.map((s, i) => ({
      title: clip("title", s.title) || `مشهد ${i + 1}`,
      duration_s: durations[i],
      visual_prompt: clip("visual_prompt", s.visual_prompt) || clip("title", s.title) || "scene",
      negative_prompt: clip("negative_prompt", s.negative_prompt),
      camera: clip("camera", s.camera),
      lighting: clip("lighting", s.lighting),
      on_screen_text: clip("on_screen_text", s.on_screen_text),
      voiceover: clip("voiceover", s.voiceover),
      sfx: clip("sfx", s.sfx),
      transition: transitions.has(String(s.transition)) ? s.transition : "cut",
      editing_notes: clip("editing_notes", s.editing_notes),
      continuity: clip("continuity", s.continuity),
      reference_asset_ids: (Array.isArray(s.reference_asset_ids) ? s.reference_asset_ids : []).filter((id): id is string => typeof id === "string" && knownAssets.has(id)),
    })),
  };
  const parsed = directorOutput.safeParse(fixed);
  if (!parsed.success) throw new ProviderError(parsed.error.message, true, "مخرجات المخرج الإبداعي ناقصة. ستُعاد المحاولة.");
  return parsed.data;
}
