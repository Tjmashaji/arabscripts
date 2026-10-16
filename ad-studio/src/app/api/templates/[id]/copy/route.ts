import { handler } from "@/server/http/route";
import { inWorkspace } from "@/server/http/scope";
import { copyTemplate } from "@/server/services/library";

export const POST = handler<{ id: string }>(async ({ user, params }) => inWorkspace(user, async (tx, ws) => ({ template: await copyTemplate(tx, user.id, ws, params.id) })));
