import { withUser } from "@/server/db";
import { handler } from "@/server/http/route";
import { isUuid } from "@/server/http/scope";
import { errors } from "@/server/http/errors";
import { getJob, requestCancel } from "@/server/services/jobs";
import { workspaceOfProject, currentWorkspace } from "@/server/services/core";

export const POST = handler<{ id: string }>(async ({ user, params }) => {
  if (!isUuid(params.id)) throw errors.notFound("المهمة");
  return withUser(user.id, async (tx) => {
    const job = await getJob(tx, params.id);
    const ws = job.project_id ? await workspaceOfProject(tx, user.id, job.project_id) : await currentWorkspace(tx, user.id);
    await requestCancel(tx, ws, params.id);
  });
});
