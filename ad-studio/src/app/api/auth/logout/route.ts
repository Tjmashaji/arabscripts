import { endSession } from "@/server/auth/session";
import { handler } from "@/server/http/route";

export const POST = handler(async () => {
  await endSession();
  return { ok: true };
}, { auth: false });
