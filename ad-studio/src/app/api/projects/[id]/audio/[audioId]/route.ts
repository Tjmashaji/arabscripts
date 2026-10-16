import { z } from "zod";
import { errors } from "@/server/http/errors";
import { body, handler } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { assertCanEdit } from "@/server/services/core";

type P = { id: string; audioId: string };
const patch = z.object({ offset_ms: z.number().int().min(0).max(60000).optional(), volume: z.number().min(0).max(2).optional(), text: z.string().max(1000).optional() });

export const PATCH = handler<P>(async ({ req, user, params }) => {
  const b = await body(req, patch);
  return inProject(user, params.id, async (tx, ws) => {
    assertCanEdit(ws);
    const row = await tx.one(
      "UPDATE audio_assets SET offset_ms = coalesce($3, offset_ms), volume = coalesce($4, volume), text = coalesce($5, text) WHERE id = $1 AND project_id = $2 RETURNING *",
      [params.audioId, params.id, b.offset_ms ?? null, b.volume ?? null, b.text ?? null],
    );
    if (!row) throw errors.notFound("المقطع الصوتي");
    return { audio: row };
  });
});

export const DELETE = handler<P>(async ({ user, params }) =>
  inProject(user, params.id, async (tx, ws) => {
    assertCanEdit(ws);
    await tx.q("DELETE FROM audio_assets WHERE id = $1 AND project_id = $2", [params.audioId, params.id]);
  }),
);
