import { handler } from "@/server/http/route";
import { inWorkspace } from "@/server/http/scope";
import { usageSummary } from "@/server/services/library";

export const GET = handler(async ({ user }) => inWorkspace(user, async (tx, ws) => ({ workspace: ws, ...(await usageSummary(tx, ws.id)) })));
