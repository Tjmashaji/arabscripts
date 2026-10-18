import { z } from "zod";
import { errors } from "@/server/http/errors";
import { body, handler, rateLimit } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { MANUAL_ONLY_MESSAGE } from "@/server/providers/manual/director";
import { directorProvider } from "@/server/providers/registry";
import { buildBrief } from "@/server/services/brief";
import { enqueueJob } from "@/server/services/jobs";

const input = z.object({
  mode: z.enum(["ideas", "direct"]),
  idempotency_key: z.string(),
  chosen_idea: z.object({ title: z.string().max(200), pitch: z.string().max(1000) }).optional(),
});

export const POST = handler<{ id: string }>(async ({ req, user, params }) => {
  const b = await body(req, input);
  await rateLimit(`director:${user.id}`, 30, 3600);
  return inProject(user, params.id, async (tx, ws) => {
    const { brief, missingTemplateFields } = await buildBrief(tx, params.id, { chosen_idea: b.chosen_idea });
    if (brief.settings.mode === "own_idea" && !brief.settings.own_idea.trim() && b.mode === "direct") throw errors.invalid("اكتب فكرتك أو السيناريو أولًا في خطوة طريقة العمل.");
    if (brief.settings.mode === "template" && !brief.settings.template_id) throw errors.invalid("اختر قالبًا أولًا.");
    const ownScript = b.mode === "direct" && brief.settings.mode === "own_idea" && !!brief.settings.own_idea.trim();
    const provider = directorProvider({ ownScript });
    if (provider.info.id === "manual" && !ownScript) throw errors.unavailable(MANUAL_ONLY_MESSAGE);
    const existing = await tx.one("SELECT 1 FROM ai_jobs WHERE workspace_id = $1 AND idempotency_key = $2", [ws.id, b.idempotency_key]);
    let briefId: string | undefined;
    if (!existing) {
      briefId = (await tx.one<{ id: string }>("INSERT INTO creative_briefs (workspace_id, project_id, input, created_by) VALUES ($1, $2, $3, $4) RETURNING id", [ws.id, params.id, brief, user.id]))!.id;
    }
    const r = await enqueueJob(tx, {
      ws, userId: user.id, projectId: params.id, type: "director",
      input: { mode: b.mode, brief_id: briefId ?? null },
      idempotencyKey: b.idempotency_key,
      estimatedCents: provider.info.mode === "live" && !provider.info.free ? (b.mode === "ideas" ? 5 : 15) : 0,
      provider,
    });
    return { ...r, missing_template_fields: missingTemplateFields };
  });
});
