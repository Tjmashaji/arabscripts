import { z } from "zod";
import type { DirectorOutput } from "@/lib/domain";
import { body, handler } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { updateScriptMeta } from "@/server/services/scenes";

// يُدمج مع السيناريو الحالي ويُتحقق منه كاملًا داخل updateScriptMeta
const patch = z.record(z.string(), z.unknown());

export const PATCH = handler<{ id: string }>(async ({ req, user, params }) => {
  const b = await body(req, patch);
  return inProject(user, params.id, (tx, ws) => updateScriptMeta(tx, user.id, ws, params.id, b as Partial<DirectorOutput>));
});
