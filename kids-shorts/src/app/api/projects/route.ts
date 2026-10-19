import { newProjectSchema } from "@/lib/domain";
import { services } from "@/server/env";
import { errors } from "@/server/http/errors";
import { body, handler, rateLimit } from "@/server/http/route";
import { enqueue } from "@/server/services/jobs";
import { createProject, listProjects } from "@/server/services/projects";

export const GET = handler(async ({ user }) => ({ projects: listProjects(user.id) }));

export const POST = handler(async ({ req, user }) => {
  rateLimit(`create:${user.id}`, 60, 3600);
  const b = await body(req, newProjectSchema);
  const s = services();
  if (b.voiceMode === "ai" && !s.voice) throw errors.unavailable("الصوت الذكي غير متصل على الخادم. اختر التسجيل بصوتك أو بدون صوت.");
  const { id, needsScript } = createProject(user.id, b, { claude: s.claude });
  if (needsScript) enqueue(user.id, id, "script", {}, 3);
  return { id };
});
