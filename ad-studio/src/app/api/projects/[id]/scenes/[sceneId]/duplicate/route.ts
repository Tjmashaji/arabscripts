import { handler } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { duplicateScene } from "@/server/services/scenes";

export const POST = handler<{ id: string; sceneId: string }>(async ({ user, params }) =>
  inProject(user, params.id, async (tx, ws) => ({ scene: await duplicateScene(tx, ws, params.id, params.sceneId) })),
);
