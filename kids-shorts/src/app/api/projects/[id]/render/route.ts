import { errors } from "@/server/http/errors";
import { handler, rateLimit } from "@/server/http/route";
import { enqueue } from "@/server/services/jobs";
import { getProject, renderIssues } from "@/server/services/projects";

export const POST = handler<{ id: string }>(async ({ user, params }) => {
  rateLimit(`render:${user.id}`, 30, 3600);
  const p = getProject(user.id, params.id);
  const issues = renderIssues(p);
  if (issues.length) throw errors.invalid(issues[0], issues);
  return { job: enqueue(user.id, params.id, "render", {}, 2) };
});
