import { services } from "@/server/env";
import { errors } from "@/server/http/errors";
import { handler, rateLimit } from "@/server/http/route";
import { enqueue } from "@/server/services/jobs";
import { getProject } from "@/server/services/projects";

// إعادة كتابة درس الموضوع المخصص بالمخرج الذكي (يستبدل المشاهد الحالية)
export const POST = handler<{ id: string }>(async ({ user, params }) => {
  if (!services().claude) throw errors.unavailable("المخرج الذكي غير متصل على الخادم (ANTHROPIC_API_KEY).");
  rateLimit(`script:${user.id}`, 20, 3600);
  const p = getProject(user.id, params.id);
  if (p.category !== "custom") throw errors.invalid("الدروس الجاهزة لا تحتاج المخرج الذكي.");
  return { job: enqueue(user.id, params.id, "script", {}, 3) };
});
