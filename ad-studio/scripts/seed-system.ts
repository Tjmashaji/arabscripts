// يزرع بيانات النظام فقط (قوالب النظام). لا ينشئ مستخدمين أو بيانات تجريبية.
// آمن للتشغيل المتكرر: يحدّث القالب إذا تغيّر محتواه في الكود.
import { Client } from "pg";
import { SYSTEM_TEMPLATES } from "../src/server/templates/system";

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL غير معرّف");
  const c = new Client({ connectionString: url });
  await c.connect();
  for (const t of SYSTEM_TEMPLATES) {
    await c.query(
      `INSERT INTO prompt_templates (workspace_id, slug, name, description, preview, business_types, goals, styles, durations, platforms, character_types, scene_types, required_fields, base_prompt, negative_prompt, variables, scene_plan, editing_notes)
       VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (slug) WHERE workspace_id IS NULL DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, preview = EXCLUDED.preview,
         business_types = EXCLUDED.business_types, goals = EXCLUDED.goals, styles = EXCLUDED.styles, durations = EXCLUDED.durations, platforms = EXCLUDED.platforms,
         character_types = EXCLUDED.character_types, scene_types = EXCLUDED.scene_types, required_fields = EXCLUDED.required_fields, base_prompt = EXCLUDED.base_prompt,
         negative_prompt = EXCLUDED.negative_prompt, variables = EXCLUDED.variables, scene_plan = EXCLUDED.scene_plan, editing_notes = EXCLUDED.editing_notes`,
      [t.slug, t.name, t.description, t.preview, t.business_types, t.goals, t.styles, t.durations, t.platforms, t.character_types, t.scene_types, t.required_fields, t.base_prompt, t.negative_prompt, JSON.stringify(t.variables), JSON.stringify(t.scene_plan), t.editing_notes],
    );
  }
  console.log(`✓ ${SYSTEM_TEMPLATES.length} قوالب نظام`);
  await c.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
