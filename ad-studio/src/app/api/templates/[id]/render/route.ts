// معاينة القالب بعد دمج بيانات نشاط مشروع معيّن، مع قائمة الحقول الناقصة (لا تُخترع قيمها)
import { errors } from "@/server/http/errors";
import { handler } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { getProject } from "@/server/services/core";
import { getTemplate } from "@/server/services/library";
import { renderTemplate } from "@/server/templates/system";

export const GET = handler<{ id: string }>(async ({ req, user, params }) => {
  const project = req.nextUrl.searchParams.get("project");
  if (!project) throw errors.invalid("حدد المشروع.");
  return inProject(user, project, async (tx) => {
    const { brand } = await getProject(tx, project);
    const t = await getTemplate(tx, params.id);
    const r = renderTemplate(t.base_prompt, brand as unknown as Record<string, string>);
    return { prompt: r.text, missing: r.missing, negative_prompt: t.negative_prompt, scene_plan: t.scene_plan };
  });
});
