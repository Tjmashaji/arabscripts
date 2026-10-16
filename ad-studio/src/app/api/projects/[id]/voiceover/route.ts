// التعليق الصوتي: مقطع مستقل لكل مشهد حتى يمكن إعادة توليد جملة واحدة ومزامنتها مع مشهدها.
import { z } from "zod";
import { VOICE_TONES } from "@/lib/domain";
import { errors } from "@/server/http/errors";
import { body, handler, rateLimit } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { speechProvider } from "@/server/providers/registry";
import { enqueueJob } from "@/server/services/jobs";
import { env } from "@/server/env";

const generate = z.object({
  action: z.literal("generate"),
  voice_id: z.string().min(1).max(120),
  speed: z.number().min(0.7).max(1.3).default(1),
  tone: z.enum(VOICE_TONES.values).default("calm"),
  scene_ids: z.array(z.string().uuid()).max(50).optional(),
  idempotency_key: z.string(),
});
const attach = z.object({ action: z.literal("attach"), asset_id: z.string().uuid(), scene_id: z.string().uuid().nullable(), text: z.string().max(1000).default("") });

export const POST = handler<{ id: string }>(async ({ req, user, params }) => {
  const b = await body(req, z.discriminatedUnion("action", [generate, attach]));
  return inProject(user, params.id, async (tx, ws) => {
    if (b.action === "attach") {
      // تسجيل صوتي رفعه المستخدم بنفسه
      const a = await tx.one("SELECT 1 FROM media_assets WHERE id = $1 AND project_id = $2 AND kind = 'audio' AND deleted_at IS NULL", [b.asset_id, params.id]);
      if (!a) throw errors.notFound("الملف الصوتي");
      if (b.scene_id) await tx.q("DELETE FROM audio_assets WHERE project_id = $1 AND scene_id = $2 AND kind = 'voiceover'", [params.id, b.scene_id]);
      const row = await tx.one("INSERT INTO audio_assets (workspace_id, project_id, scene_id, kind, text, asset_id, status) VALUES ($1, $2, $3, 'voiceover', $4, $5, 'ready') RETURNING *", [ws.id, params.id, b.scene_id, b.text, b.asset_id]);
      return { audio: row };
    }
    await rateLimit(`speech:${user.id}`, 200, 3600);
    const provider = speechProvider();
    if (!provider) throw errors.unavailable("خدمة التعليق الصوتي غير متصلة. أضف مفتاح ElevenLabs أو ارفع تسجيلًا صوتيًا.");
    const scenes = await tx.q<{ id: string; voiceover: string }>(
      "SELECT id, voiceover FROM scenes WHERE project_id = $1 AND deleted_at IS NULL AND btrim(voiceover) <> '' AND ($2::uuid[] IS NULL OR id = ANY($2)) ORDER BY position",
      [params.id, b.scene_ids ?? null],
    );
    if (!scenes.length) throw errors.invalid("لا يوجد نص تعليق صوتي في المشاهد المحددة.");
    const jobs = [];
    for (const s of scenes) {
      const key = `${b.idempotency_key}:${s.id}`;
      const exists = await tx.one("SELECT 1 FROM ai_jobs WHERE workspace_id = $1 AND idempotency_key = $2", [ws.id, key]);
      if (exists) continue;
      await tx.q("DELETE FROM audio_assets WHERE project_id = $1 AND scene_id = $2 AND kind = 'voiceover'", [params.id, s.id]);
      const audio = (await tx.one<{ id: string }>("INSERT INTO audio_assets (workspace_id, project_id, scene_id, kind, text, offset_ms, status) VALUES ($1, $2, $3, 'voiceover', $4, 150, 'pending') RETURNING id", [ws.id, params.id, s.id, s.voiceover]))!;
      const est = provider.info.mode === "live" ? Math.ceil((s.voiceover.length / 1000) * env().ELEVENLABS_CENTS_PER_1K_CHARS) : 0;
      const r = await enqueueJob(tx, { ws, userId: user.id, projectId: params.id, type: "generate_speech", input: { audio_id: audio.id, text: s.voiceover, voice_id: b.voice_id, speed: b.speed, tone: b.tone }, idempotencyKey: key, estimatedCents: est });
      await tx.q("UPDATE audio_assets SET job_id = $2 WHERE id = $1", [audio.id, r.job.id]);
      jobs.push(r.job);
    }
    return { jobs };
  });
});
