// فحص الجاهزية قبل التصدير: يعرض المشاكل (مشهد بلا مادة، ملف مفقود) دون إنشاء مهمة
import { handler } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { buildRenderPlan } from "@/server/services/export";

export const GET = handler<{ id: string }>(async ({ user, params }) =>
  inProject(user, params.id, async (tx) => {
    const { plan, problems } = await buildRenderPlan(tx, params.id, "final");
    return { problems, scenes: plan.scenes.length, voice: plan.voice.length, music: Boolean(plan.music), logo: Boolean(plan.logo), simulation: plan.simulationWatermark, total_ms: plan.scenes.reduce((a, s) => a + s.durationMs, 0) };
  }),
);
