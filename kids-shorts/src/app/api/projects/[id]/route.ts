import { z } from "zod";
import { scenesSchema, youtubeMetaSchema } from "@/lib/domain";
import { body, handler } from "@/server/http/route";
import { projectPayload } from "@/server/services/payload";
import { deleteProject, updateProject } from "@/server/services/projects";

type P = { id: string };

export const GET = handler<P>(async ({ user, params }) => projectPayload(user.id, params.id));

const patch = z.object({
  title: z.string().trim().min(1, "العنوان مطلوب").max(80).optional(),
  voiceMode: z.enum(["ai", "recorded", "none"]).optional(),
  music: z.enum(["none", "calm", "happy"]).optional(),
  scenes: scenesSchema.refine((l) => new Set(l.map((s) => s.id)).size === l.length, "معرّفات المشاهد مكررة").optional(),
  youtube: youtubeMetaSchema.optional(),
});

export const PATCH = handler<P>(async ({ req, user, params }) => {
  const b = await body(req, patch);
  updateProject(user.id, params.id, b);
  return projectPayload(user.id, params.id);
});

export const DELETE = handler<P>(async ({ user, params }) => {
  await deleteProject(user.id, params.id);
  return { ok: true };
});
