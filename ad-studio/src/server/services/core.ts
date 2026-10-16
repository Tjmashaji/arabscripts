// خدمات المساحة والمشاريع والعلامة التجارية. كل دالة تستقبل معاملة (Tx) مضبوطة على المستخدم،
// فتطبّق سياسات RLS على كل استعلام؛ والتحقق من الدور هنا طبقة ثانية لرسائل خطأ أوضح.
import { brandInput, projectSettings, type BrandInput, type ProjectSettings } from "@/lib/domain";
import type { Tx } from "../db";
import { errors } from "../http/errors";

export type Workspace = { id: string; name: string; role: "owner" | "editor" | "viewer"; plan_code: string; monthly_spend_cap_cents: number };

export async function currentWorkspace(tx: Tx, userId: string): Promise<Workspace> {
  const ws = await tx.one<Workspace>(
    `SELECT w.id, w.name, m.role, w.plan_code, w.monthly_spend_cap_cents
     FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.user_id = $1 ORDER BY (m.role = 'owner') DESC, m.created_at LIMIT 1`,
    [userId],
  );
  if (!ws) throw errors.forbidden();
  return ws;
}

export function assertCanEdit(ws: Workspace) {
  if (ws.role === "viewer") throw errors.forbidden();
}

export async function audit(tx: Tx, ws: string | null, userId: string, action: string, entity: string, entityId?: string, meta: object = {}) {
  await tx.q("INSERT INTO audit_logs (workspace_id, user_id, action, entity, entity_id, meta) VALUES ($1, $2, $3, $4, $5, $6)", [ws, userId, action, entity, entityId ?? null, meta]);
}

export type ProjectRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  title: string;
  status: string;
  wizard_step: number;
  settings: ProjectSettings;
  version: number;
  created_at: string;
  updated_at: string;
};

export type BrandRow = BrandInput & { id: string; workspace_id: string; logo_asset_id: string | null; colors: string[] };

export async function createProject(tx: Tx, userId: string, ws: Workspace, input: { title?: string; brand: BrandInput }) {
  assertCanEdit(ws);
  const b = brandInput.parse(input.brand);
  const brand = await tx.one<{ id: string }>(
    `INSERT INTO brands (workspace_id, name, business_type, description, audience, city, differentiator, offer, contact)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [ws.id, b.name, b.business_type, b.description, b.audience, b.city, b.differentiator, b.offer, b.contact],
  );
  const settings = projectSettings.parse({});
  const project = await tx.one<ProjectRow>(
    `INSERT INTO projects (workspace_id, brand_id, title, settings, created_by, wizard_step) VALUES ($1, $2, $3, $4, $5, 2) RETURNING *`,
    [ws.id, brand!.id, input.title?.trim() || `إعلان ${b.name}`, settings, userId],
  );
  await tx.q(`INSERT INTO editing_timelines (project_id, workspace_id, data, updated_by) VALUES ($1, $2, $3, $4)`, [project!.id, ws.id, { aspect: settings.aspect }, userId]);
  await audit(tx, ws.id, userId, "create", "project", project!.id);
  return project!;
}

export async function listProjects(tx: Tx, wsId: string) {
  return tx.q<{ id: string; title: string; status: string; wizard_step: number; updated_at: string; brand_name: string; business_type: string; scenes: number; thumb_id: string | null; last_export_id: string | null; settings: ProjectSettings }>(
    `SELECT p.id, p.title, p.status, p.wizard_step, p.updated_at, p.settings, b.name AS brand_name, b.business_type,
       (SELECT count(*)::int FROM scenes s WHERE s.project_id = p.id AND s.deleted_at IS NULL) AS scenes,
       (SELECT m.id FROM media_assets m WHERE m.project_id = p.id AND m.kind = 'image' AND m.deleted_at IS NULL ORDER BY m.created_at LIMIT 1) AS thumb_id,
       (SELECT e.id FROM exports e WHERE e.project_id = p.id ORDER BY e.created_at DESC LIMIT 1) AS last_export_id
     FROM projects p JOIN brands b ON b.id = p.brand_id
     WHERE p.workspace_id = $1 AND p.deleted_at IS NULL ORDER BY p.updated_at DESC`,
    [wsId],
  );
}

export async function getProject(tx: Tx, id: string) {
  const p = await tx.one<ProjectRow>("SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!p) throw errors.notFound("المشروع");
  const brand = await tx.one<BrandRow>("SELECT * FROM brands WHERE id = $1", [p.brand_id]);
  return { project: { ...p, settings: projectSettings.parse(p.settings) }, brand: brand! };
}

export async function updateBrand(tx: Tx, userId: string, ws: Workspace, projectId: string, input: unknown) {
  assertCanEdit(ws);
  const { project } = await getProject(tx, projectId);
  const b = brandInput.parse(input);
  await tx.q(
    `UPDATE brands SET name = $2, business_type = $3, description = $4, audience = $5, city = $6, differentiator = $7, offer = $8, contact = $9 WHERE id = $1`,
    [project.brand_id, b.name, b.business_type, b.description, b.audience, b.city, b.differentiator, b.offer, b.contact],
  );
  await tx.q("UPDATE projects SET updated_at = now() WHERE id = $1", [projectId]);
  await audit(tx, ws.id, userId, "update", "brand", project.brand_id);
}

export async function setBrandLogo(tx: Tx, ws: Workspace, projectId: string, assetId: string | null) {
  assertCanEdit(ws);
  const { project } = await getProject(tx, projectId);
  if (assetId) {
    const a = await tx.one("SELECT 1 FROM media_assets WHERE id = $1 AND project_id = $2 AND kind = 'image' AND deleted_at IS NULL", [assetId, projectId]);
    if (!a) throw errors.notFound("الشعار");
  }
  await tx.q("UPDATE brands SET logo_asset_id = $2 WHERE id = $1", [project.brand_id, assetId]);
}

// تحديث الإعدادات بقفل تفاؤلي: يرفض إذا عدّل شخص آخر المشروع بعد آخر قراءة
export async function updateSettings(tx: Tx, userId: string, ws: Workspace, projectId: string, patch: Partial<ProjectSettings>, version: number, wizardStep?: number) {
  assertCanEdit(ws);
  const { project } = await getProject(tx, projectId);
  const merged = projectSettings.parse({ ...project.settings, ...patch });
  const row = await tx.one<ProjectRow>(
    `UPDATE projects SET settings = $2, version = version + 1, wizard_step = GREATEST(wizard_step, $3)
     WHERE id = $1 AND version = $4 RETURNING *`,
    [projectId, merged, wizardStep ?? project.wizard_step, version],
  );
  if (!row) throw errors.conflict("عُدّل المشروع من مكان آخر. حدّث الصفحة ثم أعد المحاولة.");
  if (patch.aspect) await tx.q("UPDATE editing_timelines SET data = data || jsonb_build_object('aspect', $2::text), version = version + 1 WHERE project_id = $1", [projectId, patch.aspect]);
  await audit(tx, ws.id, userId, "update", "project_settings", projectId);
  return { ...row, settings: merged };
}

export async function renameProject(tx: Tx, ws: Workspace, projectId: string, title: string) {
  assertCanEdit(ws);
  const t = title.trim();
  if (!t || t.length > 160) throw errors.invalid("اسم المشروع يجب أن يكون بين 1 و160 حرفًا.");
  await getProject(tx, projectId);
  await tx.q("UPDATE projects SET title = $2 WHERE id = $1", [projectId, t]);
}

export async function softDeleteProject(tx: Tx, userId: string, ws: Workspace, projectId: string) {
  assertCanEdit(ws);
  await getProject(tx, projectId);
  await tx.q("UPDATE projects SET deleted_at = now() WHERE id = $1", [projectId]);
  await audit(tx, ws.id, userId, "delete", "project", projectId);
}

// صلاحية المستخدم في مساحة مشروع معيّن (وليس مساحته الافتراضية)
export async function workspaceOfProject(tx: Tx, userId: string, projectId: string): Promise<Workspace> {
  const ws = await tx.one<Workspace>(
    `SELECT w.id, w.name, m.role, w.plan_code, w.monthly_spend_cap_cents
     FROM projects p JOIN workspaces w ON w.id = p.workspace_id JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = $1
     WHERE p.id = $2 AND p.deleted_at IS NULL`,
    [userId, projectId],
  );
  if (!ws) throw errors.notFound("المشروع");
  return ws;
}
