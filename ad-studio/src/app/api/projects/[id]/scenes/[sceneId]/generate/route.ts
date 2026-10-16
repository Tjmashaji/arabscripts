// توليد مشهد واحد (فيديو أو صورة) كمهمة مستقلة؛ يمكن إعادة توليد أي مشهد دون المساس بالبقية.
import { z } from "zod";
import { errors } from "@/server/http/errors";
import { body, handler, rateLimit } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { imageProvider, videoProvider } from "@/server/providers/registry";
import { getProject } from "@/server/services/core";
import { enqueueJob } from "@/server/services/jobs";
import { env } from "@/server/env";

const input = z.object({ kind: z.enum(["video", "image"]).default("video"), idempotency_key: z.string(), reference_asset_id: z.string().uuid().nullable().optional() });

export const POST = handler<{ id: string; sceneId: string }>(async ({ req, user, params }) => {
  const b = await body(req, input);
  await rateLimit(`generate:${user.id}`, 60, 3600);
  return inProject(user, params.id, async (tx, ws) => {
    const { project } = await getProject(tx, params.id);
    const s = await tx.one<{ id: string; title: string; position: number; visual_prompt: string; negative_prompt: string; camera: string; lighting: string; continuity: string; duration_ms: number; reference_asset_ids: string[] }>(
      "SELECT * FROM scenes WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL", [params.sceneId, params.id]);
    if (!s) throw errors.notFound("المشهد");
    if (!s.visual_prompt.trim()) throw errors.invalid("اكتب وصف المشهد المرئي (البرومبت) أولًا.");
    const provider = b.kind === "video" ? videoProvider() : imageProvider();
    const ref = b.reference_asset_id ?? s.reference_asset_ids[0] ?? undefined;
    const prompt = [s.visual_prompt, s.camera && `Camera: ${s.camera}.`, s.lighting && `Lighting: ${s.lighting}.`, s.continuity && `Continuity: ${s.continuity}.`].filter(Boolean).join(" ");
    const durationS = Math.min(10, Math.max(2, Math.round(s.duration_ms / 1000)));
    const estimate = provider?.info.mode === "live" && b.kind === "video" ? Math.ceil(durationS * env().RUNWAY_EST_CREDITS_PER_SECOND * env().RUNWAY_CENTS_PER_CREDIT) : 0;
    return enqueueJob(tx, {
      ws, userId: user.id, projectId: params.id, type: b.kind === "video" ? "generate_video" : "generate_image",
      input: { scene_id: s.id, prompt, negative_prompt: s.negative_prompt, aspect: project.settings.aspect, duration_s: durationS, reference_asset_id: ref, label: `المشهد ${s.position + 1}: ${s.title}` },
      idempotencyKey: b.idempotency_key,
      estimatedCents: estimate,
    });
  });
});
