import { handler } from "@/server/http/route";
import { cancelJob } from "@/server/services/jobs";

export const POST = handler<{ id: string }>(async ({ user, params }) => ({ job: cancelJob(user.id, params.id) }));
