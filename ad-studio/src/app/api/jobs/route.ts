import { handler } from "@/server/http/route";
import { inWorkspace } from "@/server/http/scope";
import { listJobs } from "@/server/services/jobs";

export const GET = handler(async ({ req, user }) =>
  inWorkspace(user, async (tx, ws) => ({ jobs: await listJobs(tx, { wsId: ws.id, projectId: req.nextUrl.searchParams.get("project") ?? undefined, limit: 200 }) })),
);
