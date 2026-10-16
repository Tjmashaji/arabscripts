// يجمع مدخلات المخرج الإبداعي من بيانات المشروع الفعلية. تُحفظ نسخة منها في creative_briefs
// حتى يمكن معرفة ما بُني عليه كل سيناريو لاحقًا.
import type { Tx } from "../db";
import type { DirectorBrief } from "../providers/types";
import { renderTemplate } from "../templates/system";
import { getProject } from "./core";
import { getTemplate } from "./library";

export async function buildBrief(tx: Tx, projectId: string, extra: { chosen_idea?: { title: string; pitch: string } } = {}): Promise<{ brief: DirectorBrief; missingTemplateFields: string[] }> {
  const { project, brand } = await getProject(tx, projectId);
  const assets = await tx.q<{ id: string; kind: string; role: string; original_name: string; analysis: { description?: string } | null; analysis_status: string }>(
    "SELECT id, kind, role, original_name, analysis, analysis_status FROM media_assets WHERE project_id = $1 AND deleted_at IS NULL AND role NOT IN ('export', 'voice', 'music', 'sfx') AND NOT is_simulated ORDER BY created_at LIMIT 40",
    [projectId],
  );
  let template: DirectorBrief["template"];
  let missing: string[] = [];
  if (project.settings.mode === "template" && project.settings.template_id) {
    const t = await getTemplate(tx, project.settings.template_id);
    const r = renderTemplate(t.base_prompt, brand as unknown as Record<string, string>);
    missing = r.missing;
    template = { name: t.name, base_prompt: r.text, negative_prompt: t.negative_prompt, scene_plan: t.scene_plan, editing_notes: t.editing_notes };
  }
  let character: DirectorBrief["character"];
  if (project.settings.character_id) {
    character = await tx.one<NonNullable<DirectorBrief["character"]>>("SELECT name, type, presentation_style, appearance, wardrobe FROM characters WHERE id = $1 AND workspace_id = $2", [project.settings.character_id, project.workspace_id]);
  }
  return {
    brief: {
      business: { name: brand.name, business_type: brand.business_type, description: brand.description, audience: brand.audience, city: brand.city, differentiator: brand.differentiator, offer: brand.offer, contact: brand.contact },
      settings: project.settings,
      // الوصف المرئي يُرسل فقط إذا كان التحليل قد تم فعليًا
      assets: assets.map((a) => ({ id: a.id, kind: a.kind, role: a.role, name: a.original_name, description: a.analysis_status === "done" ? a.analysis?.description : undefined })),
      template,
      chosen_idea: extra.chosen_idea,
      character,
    },
    missingTemplateFields: missing,
  };
}
