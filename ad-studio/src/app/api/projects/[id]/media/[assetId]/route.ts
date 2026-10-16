import { handler } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { deleteAsset } from "@/server/services/media";

export const DELETE = handler<{ id: string; assetId: string }>(async ({ user, params }) =>
  inProject(user, params.id, (tx, ws) => deleteAsset(tx, ws, params.id, params.assetId)),
);
