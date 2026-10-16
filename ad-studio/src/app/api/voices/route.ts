import { body, handler } from "@/server/http/route";
import { inWorkspace } from "@/server/http/scope";
import { listVoices, saveVoice, voiceInput } from "@/server/services/library";

export const GET = handler(async ({ user }) => inWorkspace(user, async (tx, ws) => ({ voices: await listVoices(tx, ws.id) })));
export const POST = handler(async ({ req, user }) => {
  const b = await body(req, voiceInput);
  return inWorkspace(user, async (tx, ws) => ({ voice: await saveVoice(tx, ws, null, b) }));
});
