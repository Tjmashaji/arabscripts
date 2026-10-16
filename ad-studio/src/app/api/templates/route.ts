import { body, handler } from "@/server/http/route";
import { inWorkspace } from "@/server/http/scope";
import { listTemplates, saveTemplate, templateInput } from "@/server/services/library";

export const GET = handler(async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const f = { business_type: sp.get("business_type") || undefined, goal: sp.get("goal") || undefined, style: sp.get("style") || undefined, duration: sp.get("duration") ? Number(sp.get("duration")) : undefined, platform: sp.get("platform") || undefined, q: sp.get("q") || undefined };
  return inWorkspace(user, async (tx) => ({ templates: await listTemplates(tx, f) }));
});

export const POST = handler(async ({ req, user }) => {
  const b = await body(req, templateInput);
  return inWorkspace(user, async (tx, ws) => ({ template: await saveTemplate(tx, user.id, ws, null, b) }));
});
