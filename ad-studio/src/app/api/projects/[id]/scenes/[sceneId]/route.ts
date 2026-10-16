import { handler } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { deleteScene, updateScene } from "@/server/services/scenes";
import { errors } from "@/server/http/errors";

type P = { id: string; sceneId: string };

export const PATCH = handler<P>(async ({ req, user, params }) => {
  const raw = await req.json().catch(() => {
    throw errors.invalid("صيغة الطلب غير صحيحة.");
  });
  return inProject(user, params.id, async (tx, ws) => ({ scene: await updateScene(tx, ws, params.id, params.sceneId, raw) }));
});

export const DELETE = handler<P>(async ({ user, params }) => inProject(user, params.id, (tx, ws) => deleteScene(tx, ws, params.id, params.sceneId)));
