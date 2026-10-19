import { handler } from "@/server/http/route";
import { getJob } from "@/server/services/jobs";

export const GET = handler<{ id: string }>(async ({ user, params }) => ({ job: getJob(user.id, params.id) }));
