// العزل بين المستخدمين على مستوى قاعدة البيانات (RLS) — لا يعتمد على الواجهة.
import { describe, expect, it } from "vitest";
import { anonymous, withUser } from "@/server/db";
import { createProject, currentWorkspace, getProject } from "@/server/services/core";
import { enqueueJob } from "@/server/services/jobs";
import { ingestUpload } from "@/server/services/media";
import { listScenes, saveDirectorOutput, updateScene } from "@/server/services/scenes";
import { SimulationDirector } from "@/server/providers/simulation/director";
import { projectSettings } from "@/lib/domain";
import { fixture, newUser, owner } from "../helpers";

const brand = { name: "مطعم الاختبار", business_type: "restaurant_cafe" as const, description: "مشويات", audience: "", city: "الرياض", differentiator: "", offer: "", contact: "" };

async function setup() {
  const a = await newUser("أ");
  const b = await newUser("ب");
  const project = await withUser(a.id, async (tx) => createProject(tx, a.id, await currentWorkspace(tx, a.id), { brand }));
  return { a, b, project };
}

describe("عزل البيانات بين المستخدمين", () => {
  it("لا يرى المستخدم مشاريع غيره ولا يستطيع تعديلها", async () => {
    const { a, b, project } = await setup();
    await expect(withUser(b.id, (tx) => getProject(tx, project.id))).rejects.toMatchObject({ code: "not_found" });
    // حتى الاستعلام المباشر لا يعيد شيئًا
    const rows = await withUser(b.id, (tx) => tx.q("SELECT id FROM projects WHERE id = $1", [project.id]));
    expect(rows).toHaveLength(0);
    const upd = await withUser(b.id, (tx) => tx.q("UPDATE projects SET title = 'مخترق' WHERE id = $1 RETURNING id", [project.id]));
    expect(upd).toHaveLength(0);
    const own = await withUser(a.id, (tx) => getProject(tx, project.id));
    expect(own.project.title).not.toBe("مخترق");
  });

  it("لا يمكن إدراج بيانات في مساحة مستخدم آخر", async () => {
    const { b, project } = await setup();
    await expect(
      withUser(b.id, (tx) => tx.q("INSERT INTO scenes (workspace_id, project_id, position, duration_ms) VALUES ($1, $2, 0, 3000)", [project.workspace_id, project.id])),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      withUser(b.id, (tx) => tx.q("INSERT INTO ai_jobs (workspace_id, user_id, type, provider, idempotency_key) VALUES ($1, $2, 'export', 'ffmpeg', 'x-attack-1')", [project.workspace_id, b.id])),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("لا يرى ملفات المشاريع الأخرى ولا يستطيع تعديل مشاهدها", async () => {
    const { a, b, project } = await setup();
    const wsA = await withUser(a.id, (tx) => currentWorkspace(tx, a.id));
    const asset = await ingestUpload({ userId: a.id, ws: wsA, projectId: project.id, role: "product", name: "photo.jpg", body: fixture("photo.jpg").stream() });
    expect(await withUser(b.id, (tx) => tx.q("SELECT id FROM media_assets WHERE id = $1", [asset.id]))).toHaveLength(0);
    const out = await new SimulationDirector().direct({ business: brand, settings: projectSettings.parse({}), assets: [] });
    await withUser(a.id, (tx) => saveDirectorOutput(tx, { wsId: wsA.id, projectId: project.id, userId: a.id, output: out.output, source: "simulation", provider: "simulation" }));
    const [scene] = await withUser(a.id, (tx) => listScenes(tx, project.id));
    const wsB = await withUser(b.id, (tx) => currentWorkspace(tx, b.id));
    await expect(withUser(b.id, (tx) => updateScene(tx, wsB, project.id, scene.id, { title: "x", version: scene.version }))).rejects.toMatchObject({ code: "not_found" });
    // لا يمكنه أيضًا رفع ملف إلى مشروع غيره
    await expect(ingestUpload({ userId: b.id, ws: wsB, projectId: project.id, role: "product", name: "x.jpg", body: fixture("photo.jpg").stream() })).rejects.toMatchObject({ code: "not_found" });
  });

  it("دور المشاهد يقرأ ولا يعدّل", async () => {
    const { a, b, project } = await setup();
    await owner((c) => c.query("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'viewer')", [project.workspace_id, b.id]));
    const seen = await withUser(b.id, (tx) => getProject(tx, project.id));
    expect(seen.project.id).toBe(project.id);
    const upd = await withUser(b.id, (tx) => tx.q("UPDATE projects SET title = 'x' WHERE id = $1 RETURNING id", [project.id]));
    expect(upd).toHaveLength(0);
    void a;
  });

  it("جدول الجلسات وحدود الطلبات غير مقروءة مباشرة لتطبيق الويب", async () => {
    const { a } = await setup();
    await expect(withUser(a.id, (tx) => tx.q("SELECT * FROM sessions"))).rejects.toMatchObject({ code: "42501" });
    await expect(anonymous((tx) => tx.q("SELECT * FROM rate_limits"))).rejects.toMatchObject({ code: "42501" });
    // لا يقرأ تطبيق الويب كلمات مرور المستخدمين الآخرين
    const others = await withUser(a.id, (tx) => tx.q("SELECT id FROM users"));
    expect(others.map((r) => r.id)).toEqual([a.id]);
  });

  it("مفتاح منع التكرار يعيد نفس المهمة ولا ينشئ أخرى", async () => {
    const { a, project } = await setup();
    const ws = await withUser(a.id, (tx) => currentWorkspace(tx, a.id));
    const first = await withUser(a.id, (tx) => enqueueJob(tx, { ws, userId: a.id, projectId: project.id, type: "export", input: {}, idempotencyKey: "export-key-123456" }));
    const second = await withUser(a.id, (tx) => enqueueJob(tx, { ws, userId: a.id, projectId: project.id, type: "export", input: {}, idempotencyKey: "export-key-123456" }));
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.id).toBe(first.job.id);
  });

  it("سجل الاستخدام لا يحتسب نفس المهمة مرتين", async () => {
    const { a, project } = await setup();
    const ws = await withUser(a.id, (tx) => currentWorkspace(tx, a.id));
    const { job } = await withUser(a.id, (tx) => enqueueJob(tx, { ws, userId: a.id, projectId: project.id, type: "export", input: {}, idempotencyKey: "ledger-key-123456" }));
    const insert = () => owner((c) => c.query("INSERT INTO usage_ledger (workspace_id, job_id, entry_type, amount_cents) VALUES ($1, $2, 'charge', 50) ON CONFLICT (job_id, entry_type) WHERE job_id IS NOT NULL DO NOTHING", [ws.id, job.id]));
    await insert();
    await insert();
    const spent = await withUser(a.id, (tx) => tx.one<{ v: number }>("SELECT app.month_spend_cents($1) AS v", [ws.id]));
    expect(spent!.v).toBe(50);
  });
});
