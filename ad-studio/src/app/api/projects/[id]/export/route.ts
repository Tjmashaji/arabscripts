import { z } from "zod";
import { errors } from "@/server/http/errors";
import { body, handler, rateLimit } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { buildRenderPlan } from "@/server/services/export";
import { enqueueJob } from "@/server/services/jobs";
import { getTimeline } from "@/server/services/scenes";

export const POST = handler<{ id: string }>(async ({ req, user, params }) => {
  const b = await body(req, z.object({ quality: z.enum(["final", "preview"]).default("final"), idempotency_key: z.string() }));
  await rateLimit(`export:${user.id}`, 40, 3600);
  return inProject(user, params.id, async (tx, ws) => {
    const { problems } = await buildRenderPlan(tx, params.id, b.quality);
    if (problems.length) throw errors.invalid("المشروع غير جاهز للتصدير.", problems);
    const { data } = await getTimeline(tx, params.id);
    return enqueueJob(tx, { ws, userId: user.id, projectId: params.id, type: "export", input: { quality: b.quality, aspect: data.aspect }, idempotencyKey: b.idempotency_key });
  });
});
