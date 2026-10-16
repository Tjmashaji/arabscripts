import { errors } from "@/server/http/errors";
import { handler } from "@/server/http/route";
import { inWorkspace, isUuid } from "@/server/http/scope";
import { deleteTemplate, getTemplate, saveTemplate } from "@/server/services/library";

type P = { id: string };
const check = (id: string) => {
  if (!isUuid(id)) throw errors.notFound("القالب");
};
export const GET = handler<P>(async ({ user, params }) => (check(params.id), inWorkspace(user, async (tx) => ({ template: await getTemplate(tx, params.id) }))));
export const PATCH = handler<P>(async ({ req, user, params }) => {
  check(params.id);
  const raw = await req.json().catch(() => null);
  return inWorkspace(user, async (tx, ws) => ({ template: await saveTemplate(tx, user.id, ws, params.id, raw) }));
});
export const DELETE = handler<P>(async ({ user, params }) => (check(params.id), inWorkspace(user, (tx, ws) => deleteTemplate(tx, ws, params.id))));
