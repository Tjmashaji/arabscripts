import { body, handler } from "@/server/http/route";
import { inWorkspace } from "@/server/http/scope";
import { deleteVoice, saveVoice, voiceInput } from "@/server/services/library";

type P = { id: string };
export const PATCH = handler<P>(async ({ req, user, params }) => {
  const b = await body(req, voiceInput);
  return inWorkspace(user, async (tx, ws) => ({ voice: await saveVoice(tx, ws, params.id, b) }));
});
export const DELETE = handler<P>(async ({ user, params }) => inWorkspace(user, (tx, ws) => deleteVoice(tx, ws, params.id)));
