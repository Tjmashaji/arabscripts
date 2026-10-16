import { z } from "zod";
import { brandInput } from "@/lib/domain";
import { body, handler } from "@/server/http/route";
import { inWorkspace } from "@/server/http/scope";
import { createProject, listProjects } from "@/server/services/core";

export const GET = handler(async ({ user }) => inWorkspace(user, async (tx, ws) => ({ workspace: ws, projects: await listProjects(tx, ws.id) })));

const input = z.object({ title: z.string().trim().max(160).optional(), brand: brandInput });
export const POST = handler(async ({ req, user }) => {
  const b = await body(req, input);
  return inWorkspace(user, async (tx, ws) => ({ project: await createProject(tx, user.id, ws, b) }));
});
