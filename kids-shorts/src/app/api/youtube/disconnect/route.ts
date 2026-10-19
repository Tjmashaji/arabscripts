import { handler } from "@/server/http/route";
import { disconnect } from "@/server/services/youtube";

export const POST = handler(async ({ user }) => {
  await disconnect(user.id);
  return { ok: true };
});
