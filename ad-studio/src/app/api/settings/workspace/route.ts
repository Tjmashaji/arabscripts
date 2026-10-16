import { z } from "zod";
import { errors } from "@/server/http/errors";
import { body, handler } from "@/server/http/route";
import { inWorkspace } from "@/server/http/scope";
import { audit } from "@/server/services/core";

export const PATCH = handler(async ({ req, user }) => {
  const b = await body(req, z.object({ name: z.string().trim().min(1).max(120), monthly_spend_cap_cents: z.number().int().min(0).max(10_000_000) }));
  return inWorkspace(user, async (tx, ws) => {
    if (ws.role !== "owner") throw errors.forbidden();
    await tx.q("UPDATE workspaces SET name = $2, monthly_spend_cap_cents = $3 WHERE id = $1", [ws.id, b.name, b.monthly_spend_cap_cents]);
    await audit(tx, ws.id, user.id, "update", "workspace", ws.id, { cap: b.monthly_spend_cap_cents });
  });
});
