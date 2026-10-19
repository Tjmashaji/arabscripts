import { services } from "@/server/env";
import { errors } from "@/server/http/errors";
import { handler, rateLimit } from "@/server/http/route";
import { enqueue } from "@/server/services/jobs";
import { getProject } from "@/server/services/projects";

export const POST = handler<{ id: string }>(async ({ user, params }) => {
  if (!services().voice) throw errors.unavailable("الصوت الذكي غير متصل على الخادم (ELEVENLABS_API_KEY وELEVENLABS_VOICE_ID).");
  rateLimit(`speech:${user.id}`, 30, 3600);
  getProject(user.id, params.id);
  return { job: enqueue(user.id, params.id, "speech", {}, 3) };
});
