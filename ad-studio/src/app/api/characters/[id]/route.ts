import { body, handler } from "@/server/http/route";
import { inWorkspace } from "@/server/http/scope";
import { characterInput, deleteCharacter, saveCharacter } from "@/server/services/library";

type P = { id: string };
export const PATCH = handler<P>(async ({ req, user, params }) => {
  const b = await body(req, characterInput);
  return inWorkspace(user, async (tx, ws) => ({ character: await saveCharacter(tx, ws, params.id, b) }));
});
export const DELETE = handler<P>(async ({ user, params }) => inWorkspace(user, (tx, ws) => deleteCharacter(tx, ws, params.id)));
