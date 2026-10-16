import { z } from "zod";
import { errors } from "@/server/http/errors";
import { body, handler } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { enqueueJob } from "@/server/services/jobs";

export const POST = handler<{ id: string; assetId: string }>(async ({ req, user, params }) => {
  const b = await body(req, z.object({ idempotency_key: z.string() }));
  return inProject(user, params.id, async (tx, ws) => {
    const a = await tx.one("SELECT 1 FROM media_assets WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL AND kind <> 'audio'", [params.assetId, params.id]);
    if (!a) throw errors.notFound("الملف");
    const r = await enqueueJob(tx, { ws, userId: user.id, projectId: params.id, type: "analyze_media", input: { asset_id: params.assetId }, idempotencyKey: b.idempotency_key, estimatedCents: 2 });
    await tx.q("UPDATE media_assets SET analysis_status = 'pending' WHERE id = $1", [params.assetId]);
    return r;
  });
});
