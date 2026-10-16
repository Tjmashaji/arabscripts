import { z } from "zod";
import type { ProjectSettings } from "@/lib/domain";
import { errors } from "@/server/http/errors";
import { body, handler } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { getProject, renameProject, softDeleteProject, updateBrand, updateSettings } from "@/server/services/core";
import { listAssets, signedUrl } from "@/server/services/media";
import { currentScript, getTimeline, listScenes } from "@/server/services/scenes";
import { listJobs } from "@/server/services/jobs";

type P = { id: string };

export const GET = handler<P>(async ({ user, params }) =>
  inProject(user, params.id, async (tx, ws) => {
    const { project, brand } = await getProject(tx, params.id);
    const assets = (await listAssets(tx, params.id)).map((a) => ({ ...a, url: signedUrl(a.id) }));
    const audio = await tx.q("SELECT a.*, m.duration_ms AS asset_duration_ms FROM audio_assets a LEFT JOIN media_assets m ON m.id = a.asset_id WHERE a.project_id = $1 ORDER BY a.created_at", [params.id]);
    const exportsList = (await tx.q<{ id: string; asset_id: string | null; created_at: string; is_simulated: boolean; aspect: string; width: number; height: number; duration_ms: number; settings_snapshot: { quality?: string } }>("SELECT * FROM exports WHERE project_id = $1 ORDER BY created_at DESC LIMIT 20", [params.id]))
      .map((e) => ({ ...e, url: e.asset_id ? signedUrl(e.asset_id) : null, download: e.asset_id ? signedUrl(e.asset_id) + "&download=1" : null }));
    return {
      workspace: ws,
      project,
      brand,
      assets,
      script: await currentScript(tx, params.id),
      scenes: await listScenes(tx, params.id),
      timeline: await getTimeline(tx, params.id),
      audio: audio.map((a) => ({ ...a, url: a.asset_id ? signedUrl(String(a.asset_id)) : null })),
      jobs: await listJobs(tx, { wsId: ws.id, projectId: params.id, limit: 50 }),
      exports: exportsList,
    };
  }),
);

const patch = z.object({
  title: z.string().optional(),
  brand: z.unknown().optional(),
  // سجل حر يُدمج مع الإعدادات الحالية ثم يُتحقق منه كاملًا (partial مع قيم افتراضية كان سيمسح الحقول غير المرسلة)
  settings: z.record(z.string(), z.unknown()).optional(),
  version: z.number().int().positive().optional(),
  wizard_step: z.number().int().min(1).max(6).optional(),
});

export const PATCH = handler<P>(async ({ req, user, params }) => {
  const b = await body(req, patch);
  return inProject(user, params.id, async (tx, ws) => {
    if (b.title !== undefined) await renameProject(tx, ws, params.id, b.title);
    if (b.brand !== undefined) await updateBrand(tx, user.id, ws, params.id, b.brand);
    if (b.settings || b.wizard_step) {
      if (!b.version) throw errors.invalid("رقم النسخة مطلوب لحفظ الإعدادات.");
      return { project: await updateSettings(tx, user.id, ws, params.id, (b.settings ?? {}) as Partial<ProjectSettings>, b.version, b.wizard_step) };
    }
    return { project: (await getProject(tx, params.id)).project };
  });
});

export const DELETE = handler<P>(async ({ user, params }) => inProject(user, params.id, (tx, ws) => softDeleteProject(tx, user.id, ws, params.id)));
