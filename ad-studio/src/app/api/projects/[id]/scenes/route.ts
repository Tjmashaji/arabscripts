import { z } from "zod";
import { body, handler } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { addScene, listScenes, reorderScenes } from "@/server/services/scenes";

type P = { id: string };
export const GET = handler<P>(async ({ user, params }) => inProject(user, params.id, async (tx) => ({ scenes: await listScenes(tx, params.id) })));

export const POST = handler<P>(async ({ req, user, params }) => {
  const b = await body(req, z.object({ after_position: z.number().int().min(-1).nullable().default(null) }));
  return inProject(user, params.id, async (tx, ws) => ({ scene: await addScene(tx, ws, params.id, b.after_position) }));
});

// إعادة الترتيب: قائمة كاملة بمعرّفات المشاهد بالترتيب الجديد
export const PATCH = handler<P>(async ({ req, user, params }) => {
  const b = await body(req, z.object({ order: z.array(z.string().uuid()).min(1).max(50) }));
  return inProject(user, params.id, async (tx, ws) => ({ scenes: await reorderScenes(tx, ws, params.id, b.order) }));
});
