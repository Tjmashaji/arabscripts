// مكتبة القوالب، والأصوات المحفوظة، والشخصيات، والاستخدام والتكلفة.
import { z } from "zod";
import { CHARACTER_TYPES, LANGUAGES, VOICE_TONES } from "@/lib/domain";
import type { Tx } from "../db";
import { errors } from "../http/errors";
import { assertCanEdit, type Workspace } from "./core";

export type TemplateRow = {
  id: string;
  workspace_id: string | null;
  slug: string | null;
  name: string;
  description: string;
  preview: string;
  business_types: string[];
  goals: string[];
  styles: string[];
  durations: number[];
  platforms: string[];
  character_types: string[];
  scene_types: string[];
  required_fields: string[];
  base_prompt: string;
  negative_prompt: string;
  variables: { key: string; label: string; source: string }[];
  scene_plan: { title: string; duration_s: number; goal: string }[];
  editing_notes: string;
};

export function listTemplates(tx: Tx, f: { business_type?: string; goal?: string; style?: string; duration?: number; platform?: string; q?: string }) {
  return tx.q<TemplateRow>(
    `SELECT * FROM prompt_templates WHERE deleted_at IS NULL
       AND ($1::text IS NULL OR $1 = ANY(business_types))
       AND ($2::text IS NULL OR $2 = ANY(goals))
       AND ($3::text IS NULL OR $3 = ANY(styles))
       AND ($4::int IS NULL OR $4 = ANY(durations))
       AND ($5::text IS NULL OR $5 = ANY(platforms))
       AND ($6::text IS NULL OR name ILIKE '%' || $6 || '%' OR description ILIKE '%' || $6 || '%')
     ORDER BY workspace_id NULLS LAST, name`,
    [f.business_type ?? null, f.goal ?? null, f.style ?? null, f.duration ?? null, f.platform ?? null, f.q ?? null],
  );
}

export async function getTemplate(tx: Tx, id: string) {
  const t = await tx.one<TemplateRow>("SELECT * FROM prompt_templates WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!t) throw errors.notFound("القالب");
  return t;
}

const scenePlan = z.array(z.object({ title: z.string().trim().min(1).max(120), duration_s: z.number().min(0.5).max(60), goal: z.string().trim().max(500) })).max(20);
export const templateInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(""),
  preview: z.string().trim().max(300).default(""),
  business_types: z.array(z.string()).max(10).default([]),
  goals: z.array(z.string()).max(10).default([]),
  styles: z.array(z.string()).max(10).default([]),
  durations: z.array(z.number().int().min(5).max(120)).max(10).default([]),
  platforms: z.array(z.string()).max(10).default([]),
  character_types: z.array(z.string()).max(10).default([]),
  required_fields: z.array(z.string()).max(10).default([]),
  base_prompt: z.string().trim().min(1).max(5000),
  negative_prompt: z.string().trim().max(2000).default(""),
  scene_plan: scenePlan.default([]),
  editing_notes: z.string().trim().max(2000).default(""),
});

export async function copyTemplate(tx: Tx, userId: string, ws: Workspace, id: string) {
  assertCanEdit(ws);
  const t = await getTemplate(tx, id);
  return tx.one<TemplateRow>(
    `INSERT INTO prompt_templates (workspace_id, name, description, preview, business_types, goals, styles, durations, platforms, character_types, scene_types, required_fields, base_prompt, negative_prompt, variables, scene_plan, editing_notes, copied_from, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
    [ws.id, `${t.name} (نسخة)`, t.description, t.preview, t.business_types, t.goals, t.styles, t.durations, t.platforms, t.character_types, t.scene_types, t.required_fields, t.base_prompt, t.negative_prompt, JSON.stringify(t.variables), JSON.stringify(t.scene_plan), t.editing_notes, t.id, userId],
  );
}

export async function saveTemplate(tx: Tx, userId: string, ws: Workspace, id: string | null, raw: unknown) {
  assertCanEdit(ws);
  const t = templateInput.parse(raw);
  if (id) {
    const own = await tx.one<{ workspace_id: string | null }>("SELECT workspace_id FROM prompt_templates WHERE id = $1 AND deleted_at IS NULL", [id]);
    if (!own) throw errors.notFound("القالب");
    if (!own.workspace_id) throw errors.invalid("قوالب النظام للقراءة فقط. انسخ القالب ثم عدّل نسختك.");
    return tx.one<TemplateRow>(
      `UPDATE prompt_templates SET name=$2, description=$3, preview=$4, business_types=$5, goals=$6, styles=$7, durations=$8, platforms=$9, character_types=$10, required_fields=$11, base_prompt=$12, negative_prompt=$13, scene_plan=$14, editing_notes=$15 WHERE id=$1 RETURNING *`,
      [id, t.name, t.description, t.preview, t.business_types, t.goals, t.styles, t.durations, t.platforms, t.character_types, t.required_fields, t.base_prompt, t.negative_prompt, JSON.stringify(t.scene_plan), t.editing_notes],
    );
  }
  return tx.one<TemplateRow>(
    `INSERT INTO prompt_templates (workspace_id, name, description, preview, business_types, goals, styles, durations, platforms, character_types, required_fields, base_prompt, negative_prompt, scene_plan, editing_notes, created_by, variables)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'[]') RETURNING *`,
    [ws.id, t.name, t.description, t.preview, t.business_types, t.goals, t.styles, t.durations, t.platforms, t.character_types, t.required_fields, t.base_prompt, t.negative_prompt, JSON.stringify(t.scene_plan), t.editing_notes, userId],
  );
}

export async function deleteTemplate(tx: Tx, ws: Workspace, id: string) {
  assertCanEdit(ws);
  const row = await tx.one("UPDATE prompt_templates SET deleted_at = now() WHERE id = $1 AND workspace_id IS NOT NULL RETURNING id", [id]);
  if (!row) throw errors.notFound("القالب");
}

// ───── الأصوات والشخصيات ─────
export const voiceInput = z.object({
  name: z.string().trim().min(1).max(80),
  provider: z.string().min(1).max(40),
  provider_voice_id: z.string().min(1).max(120),
  language: z.string().default("ar"),
  dialect: z.enum(LANGUAGES.values).default("ar_msa"),
  gender: z.enum(["male", "female", "neutral"]).default("male"),
  speed: z.number().min(0.7).max(1.3).default(1),
  tone: z.enum(VOICE_TONES.values).default("calm"),
  is_favorite: z.boolean().default(false),
});

export const characterInput = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(CHARACTER_TYPES.values),
  presentation_style: z.string().trim().max(500).default(""),
  appearance: z.string().trim().max(1000).default(""),
  wardrobe: z.string().trim().max(500).default(""),
  voice_profile_id: z.string().uuid().nullable().default(null),
  rights_confirmed: z.boolean().default(false),
  is_favorite: z.boolean().default(false),
});

export function listVoices(tx: Tx, wsId: string) {
  return tx.q("SELECT * FROM voice_profiles WHERE workspace_id = $1 ORDER BY is_favorite DESC, created_at DESC", [wsId]);
}
export async function saveVoice(tx: Tx, ws: Workspace, id: string | null, raw: unknown) {
  assertCanEdit(ws);
  const v = voiceInput.parse(raw);
  if (id) {
    const r = await tx.one("UPDATE voice_profiles SET name=$2, provider=$3, provider_voice_id=$4, language=$5, dialect=$6, gender=$7, speed=$8, tone=$9, is_favorite=$10 WHERE id=$1 RETURNING *", [id, v.name, v.provider, v.provider_voice_id, v.language, v.dialect, v.gender, v.speed, v.tone, v.is_favorite]);
    if (!r) throw errors.notFound("الصوت");
    return r;
  }
  return tx.one("INSERT INTO voice_profiles (workspace_id, name, provider, provider_voice_id, language, dialect, gender, speed, tone, is_favorite) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *", [ws.id, v.name, v.provider, v.provider_voice_id, v.language, v.dialect, v.gender, v.speed, v.tone, v.is_favorite]);
}
export async function deleteVoice(tx: Tx, ws: Workspace, id: string) {
  assertCanEdit(ws);
  await tx.q("DELETE FROM voice_profiles WHERE id = $1", [id]);
}

export function listCharacters(tx: Tx, wsId: string) {
  return tx.q("SELECT * FROM characters WHERE workspace_id = $1 ORDER BY is_favorite DESC, created_at DESC", [wsId]);
}
export async function saveCharacter(tx: Tx, ws: Workspace, id: string | null, raw: unknown) {
  assertCanEdit(ws);
  const c = characterInput.parse(raw);
  // الشخصيات البشرية الواقعية تتطلب إقرار حقوق الاستخدام والموافقة
  if (c.type === "ai_human" && !c.rights_confirmed) throw errors.invalid("أكّد أن لديك حقوق استخدام هذه الشخصية وموافقة أصحاب الملامح المرجعية إن وُجدت.");
  if (id) {
    const r = await tx.one("UPDATE characters SET name=$2, type=$3, presentation_style=$4, appearance=$5, wardrobe=$6, voice_profile_id=$7, rights_confirmed=$8, is_favorite=$9 WHERE id=$1 RETURNING *", [id, c.name, c.type, c.presentation_style, c.appearance, c.wardrobe, c.voice_profile_id, c.rights_confirmed, c.is_favorite]);
    if (!r) throw errors.notFound("الشخصية");
    return r;
  }
  return tx.one("INSERT INTO characters (workspace_id, name, type, presentation_style, appearance, wardrobe, voice_profile_id, rights_confirmed, is_favorite) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *", [ws.id, c.name, c.type, c.presentation_style, c.appearance, c.wardrobe, c.voice_profile_id, c.rights_confirmed, c.is_favorite]);
}
export async function deleteCharacter(tx: Tx, ws: Workspace, id: string) {
  assertCanEdit(ws);
  await tx.q("DELETE FROM characters WHERE id = $1", [id]);
}

// ───── الاستخدام ─────
export async function usageSummary(tx: Tx, wsId: string) {
  const month = (await tx.one<{ v: number }>("SELECT app.month_spend_cents($1) AS v", [wsId]))!.v;
  const ledger = await tx.q("SELECT l.*, j.type AS job_type FROM usage_ledger l LEFT JOIN ai_jobs j ON j.id = l.job_id WHERE l.workspace_id = $1 ORDER BY l.created_at DESC LIMIT 100", [wsId]);
  const byType = await tx.q<{ type: string; n: number; cents: number }>(
    "SELECT j.type, count(*)::int AS n, coalesce(sum(j.cost_cents), 0)::int AS cents FROM ai_jobs j WHERE j.workspace_id = $1 AND j.created_at >= date_trunc('month', now()) GROUP BY j.type ORDER BY j.type",
    [wsId],
  );
  return { monthCents: month, ledger, byType };
}
