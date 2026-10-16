import { z } from "zod";
import { body, handler } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { getTimeline, updateTimeline } from "@/server/services/scenes";

type P = { id: string };
export const GET = handler<P>(async ({ user, params }) => inProject(user, params.id, (tx) => getTimeline(tx, params.id)));
export const PATCH = handler<P>(async ({ req, user, params }) => {
  const b = await body(req, z.object({ data: z.unknown(), version: z.number().int().positive() }));
  return inProject(user, params.id, (tx, ws) => updateTimeline(tx, user.id, ws, params.id, b.data, b.version));
});
