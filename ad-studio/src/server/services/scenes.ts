// السيناريو والمشاهد: حفظ مخرجات المخرج الإبداعي كنسخة جديدة، وتعديل المشاهد بقفل تفاؤلي.
import { directorOutput, sceneUpdate, timelineData, type DirectorOutput } from "@/lib/domain";
import type { z } from "zod";
import type { Tx } from "../db";
import { errors } from "../http/errors";
import { assertCanEdit, audit, getProject, type Workspace } from "./core";

export type SceneRow = {
  id: string;
  project_id: string;
  position: number;
  title: string;
  duration_ms: number;
  visual_prompt: string;
  negative_prompt: string;
  camera: string;
  lighting: string;
  on_screen_text: string;
  voiceover: string;
  sfx: string;
  transition: string;
  editing_notes: string;
  continuity: string;
  reference_asset_ids: string[];
  source_type: "generate" | "upload" | "none";
  selected_asset_id: string | null;
  trim_start_ms: number;
  version: number;
};

export function listScenes(tx: Tx, projectId: string) {
  return tx.q<SceneRow>("SELECT * FROM scenes WHERE project_id = $1 AND deleted_at IS NULL ORDER BY position", [projectId]);
}

export async function currentScript(tx: Tx, projectId: string) {
  return tx.one<{ id: string; version: number; source: string; provider: string | null; content: DirectorOutput; created_at: string }>(
    "SELECT id, version, source, provider, content, created_at FROM scripts WHERE project_id = $1 AND is_current",
    [projectId],
  );
}

// يُستدعى من العامل (مخرجات المخرج) ومن الواجهة (سيناريو يكتبه المستخدم): نسخة جديدة دون حذف القديمة
export async function saveDirectorOutput(
  tx: Tx,
  args: { wsId: string; projectId: string; userId: string | null; output: DirectorOutput; source: "ai" | "simulation" | "user" | "template"; provider: string | null; briefId?: string | null },
) {
  const out = directorOutput.parse(args.output);
  const next = (await tx.one<{ v: number }>("SELECT coalesce(max(version), 0) + 1 AS v FROM scripts WHERE project_id = $1", [args.projectId]))!.v;
  await tx.q("UPDATE scripts SET is_current = false WHERE project_id = $1 AND is_current", [args.projectId]);
  const script = await tx.one<{ id: string }>(
    `INSERT INTO scripts (workspace_id, project_id, brief_id, version, source, provider, content, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [args.wsId, args.projectId, args.briefId ?? null, next, args.source, args.provider, out, args.userId],
  );
  // المشاهد السابقة تُحذف منطقيًا وتبقى في قاعدة البيانات مع توليداتها
  await tx.q("UPDATE scenes SET deleted_at = now() WHERE project_id = $1 AND deleted_at IS NULL", [args.projectId]);
  for (const [i, s] of out.scenes.entries()) {
    await tx.q(
      `INSERT INTO scenes (workspace_id, project_id, position, title, duration_ms, visual_prompt, negative_prompt, camera, lighting, on_screen_text, voiceover, sfx, transition, editing_notes, continuity, reference_asset_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [args.wsId, args.projectId, i, s.title, Math.round(s.duration_s * 1000), s.visual_prompt, s.negative_prompt, s.camera, s.lighting, s.on_screen_text, s.voiceover, s.sfx, s.transition, s.editing_notes, s.continuity, s.reference_asset_ids],
    );
  }
  await tx.q("UPDATE projects SET status = CASE WHEN status = 'draft' THEN 'scripting' ELSE status END, wizard_step = GREATEST(wizard_step, 5) WHERE id = $1", [args.projectId]);
  return { scriptId: script!.id, version: next };
}

// تعديل نص السيناريو العام (الحملة والخطاف والدعوة) يحفظ نسخة جديدة بنفس المشاهد الحالية
export async function updateScriptMeta(tx: Tx, userId: string, ws: Workspace, projectId: string, patch: Partial<DirectorOutput>) {
  assertCanEdit(ws);
  await getProject(tx, projectId);
  const cur = await currentScript(tx, projectId);
  if (!cur) throw errors.notFound("السيناريو");
  const scenes = await listScenes(tx, projectId);
  const { scenes: _ignored, ...meta } = patch;
  void _ignored;
  const content = directorOutput.parse({
    ...cur.content,
    ...meta,
    scenes: scenes.map((s) => ({ ...s, duration_s: s.duration_ms / 1000 })),
  });
  const next = cur.version + 1;
  await tx.q("UPDATE scripts SET is_current = false WHERE id = $1", [cur.id]);
  await tx.q("INSERT INTO scripts (workspace_id, project_id, version, source, provider, content, created_by) VALUES ($1, $2, $3, 'user', NULL, $4, $5)", [ws.id, projectId, next, content, userId]);
  await audit(tx, ws.id, userId, "update", "script", projectId, { version: next });
  return { version: next };
}

async function sceneInProject(tx: Tx, projectId: string, sceneId: string) {
  const s = await tx.one<SceneRow>("SELECT * FROM scenes WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL", [sceneId, projectId]);
  if (!s) throw errors.notFound("المشهد");
  return s;
}

const SCENE_COLUMNS = ["title", "visual_prompt", "negative_prompt", "camera", "lighting", "on_screen_text", "voiceover", "sfx", "transition", "editing_notes", "continuity", "reference_asset_ids", "duration_ms", "source_type", "selected_asset_id", "trim_start_ms"] as const;

export async function updateScene(tx: Tx, ws: Workspace, projectId: string, sceneId: string, raw: unknown) {
  assertCanEdit(ws);
  const patch: z.infer<typeof sceneUpdate> = sceneUpdate.parse(raw);
  await sceneInProject(tx, projectId, sceneId);
  if (patch.selected_asset_id) {
    const a = await tx.one<{ kind: string; duration_ms: number | null }>("SELECT kind, duration_ms FROM media_assets WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL AND kind IN ('image', 'video')", [patch.selected_asset_id, projectId]);
    if (!a) throw errors.notFound("الملف المختار");
  }
  if (patch.reference_asset_ids?.length) {
    const n = (await tx.one<{ n: number }>("SELECT count(*)::int AS n FROM media_assets WHERE id = ANY($1) AND project_id = $2 AND deleted_at IS NULL", [patch.reference_asset_ids, projectId]))!.n;
    if (n !== new Set(patch.reference_asset_ids).size) throw errors.invalid("أحد الملفات المرجعية غير موجود في هذا المشروع.");
  }
  const sets: string[] = [];
  const vals: unknown[] = [sceneId, patch.version];
  for (const col of SCENE_COLUMNS) {
    const v = (patch as Record<string, unknown>)[col];
    if (v !== undefined) {
      vals.push(v);
      sets.push(`${col} = $${vals.length}`);
    }
  }
  if (!sets.length) throw errors.invalid("لا توجد تعديلات.");
  const row = await tx.one<SceneRow>(`UPDATE scenes SET ${sets.join(", ")}, version = version + 1 WHERE id = $1 AND version = $2 RETURNING *`, vals);
  if (!row) throw errors.conflict("عُدّل هذا المشهد من مكان آخر. حدّث الصفحة.");
  return row;
}

export async function reorderScenes(tx: Tx, ws: Workspace, projectId: string, order: string[]) {
  assertCanEdit(ws);
  const scenes = await listScenes(tx, projectId);
  const ids = new Set(scenes.map((s) => s.id));
  if (order.length !== ids.size || !order.every((id) => ids.has(id))) throw errors.invalid("ترتيب المشاهد لا يطابق مشاهد المشروع.");
  // ترقيم مؤقت سالب لتجنب أي تعارض أثناء التبديل
  for (const [i, id] of order.entries()) await tx.q("UPDATE scenes SET position = $2, version = version + 1 WHERE id = $1", [id, 10000 + i]);
  for (const [i, id] of order.entries()) await tx.q("UPDATE scenes SET position = $2 WHERE id = $1", [id, i]);
  return listScenes(tx, projectId);
}

export async function addScene(tx: Tx, ws: Workspace, projectId: string, afterPosition: number | null) {
  assertCanEdit(ws);
  await getProject(tx, projectId);
  const scenes = await listScenes(tx, projectId);
  const pos = afterPosition === null ? scenes.length : Math.min(scenes.length, afterPosition + 1);
  for (const s of scenes.filter((x) => x.position >= pos).reverse()) await tx.q("UPDATE scenes SET position = position + 1 WHERE id = $1", [s.id]);
  return tx.one<SceneRow>(
    `INSERT INTO scenes (workspace_id, project_id, position, title, duration_ms, visual_prompt) VALUES ($1, $2, $3, 'مشهد جديد', 3000, '') RETURNING *`,
    [ws.id, projectId, pos],
  );
}

export async function deleteScene(tx: Tx, ws: Workspace, projectId: string, sceneId: string) {
  assertCanEdit(ws);
  const s = await sceneInProject(tx, projectId, sceneId);
  await tx.q("UPDATE scenes SET deleted_at = now() WHERE id = $1", [sceneId]);
  await tx.q("UPDATE scenes SET position = position - 1 WHERE project_id = $1 AND deleted_at IS NULL AND position > $2", [projectId, s.position]);
}

export async function duplicateScene(tx: Tx, ws: Workspace, projectId: string, sceneId: string) {
  assertCanEdit(ws);
  const s = await sceneInProject(tx, projectId, sceneId);
  await tx.q("UPDATE scenes SET position = position + 1 WHERE project_id = $1 AND deleted_at IS NULL AND position > $2", [projectId, s.position]);
  return tx.one<SceneRow>(
    `INSERT INTO scenes (workspace_id, project_id, position, title, duration_ms, visual_prompt, negative_prompt, camera, lighting, on_screen_text, voiceover, sfx, transition, editing_notes, continuity, reference_asset_ids, source_type, selected_asset_id, trim_start_ms)
     SELECT workspace_id, project_id, position + 1, title || ' (نسخة)', duration_ms, visual_prompt, negative_prompt, camera, lighting, on_screen_text, voiceover, sfx, transition, editing_notes, continuity, reference_asset_ids, source_type, selected_asset_id, trim_start_ms
     FROM scenes WHERE id = $1 RETURNING *`,
    [sceneId],
  );
}

// ───── خط المونتاج ─────
export async function getTimeline(tx: Tx, projectId: string) {
  const t = await tx.one<{ version: number; data: unknown }>("SELECT version, data FROM editing_timelines WHERE project_id = $1", [projectId]);
  if (!t) throw errors.notFound("خط المونتاج");
  return { version: t.version, data: timelineData.parse(t.data) };
}

export async function updateTimeline(tx: Tx, userId: string, ws: Workspace, projectId: string, data: unknown, version: number) {
  assertCanEdit(ws);
  const parsed = timelineData.parse(data);
  for (const id of [parsed.music_asset_id, parsed.logo.asset_id].filter(Boolean)) {
    const a = await tx.one("SELECT 1 FROM media_assets WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL", [id, projectId]);
    if (!a) throw errors.notFound("الملف");
  }
  const row = await tx.one<{ version: number }>(
    "UPDATE editing_timelines SET data = $2, version = version + 1, updated_by = $3, updated_at = now() WHERE project_id = $1 AND version = $4 RETURNING version",
    [projectId, parsed, userId, version],
  );
  if (!row) throw errors.conflict("عُدّل المونتاج من مكان آخر. حدّث الصفحة.");
  await tx.q("UPDATE projects SET status = CASE WHEN status IN ('draft', 'scripting', 'producing') THEN 'editing' ELSE status END, settings = settings || jsonb_build_object('aspect', $2::text) WHERE id = $1", [projectId, parsed.aspect]);
  return { version: row.version, data: parsed };
}
