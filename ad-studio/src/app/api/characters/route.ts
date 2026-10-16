import { body, handler } from "@/server/http/route";
import { inWorkspace } from "@/server/http/scope";
import { characterInput, listCharacters, saveCharacter } from "@/server/services/library";

export const GET = handler(async ({ user }) => inWorkspace(user, async (tx, ws) => ({ characters: await listCharacters(tx, ws.id) })));
export const POST = handler(async ({ req, user }) => {
  const b = await body(req, characterInput);
  return inWorkspace(user, async (tx, ws) => ({ character: await saveCharacter(tx, ws, null, b) }));
});
