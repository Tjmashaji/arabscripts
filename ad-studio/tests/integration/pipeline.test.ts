// سيناريو القبول: إعلان مطعم 30 ثانية، ترندي، راوٍ صوتي، 9:16، من مواد حقيقية مرفوعة.
// يعمل في وضع المحاكاة (لا مفاتيح)، والتصدير حقيقي بالكامل عبر FFmpeg.
import { describe, expect, it } from "vitest";
import { withUser } from "@/server/db";
import { probe } from "@/server/media/probe";
import { storage } from "@/server/media/storage";
import { buildBrief } from "@/server/services/brief";
import { createProject, currentWorkspace, updateSettings } from "@/server/services/core";
import { buildRenderPlan } from "@/server/services/export";
import { enqueueJob, getJob } from "@/server/services/jobs";
import { ingestUpload } from "@/server/services/media";
import { listScenes, reorderScenes, updateScene, updateTimeline, getTimeline } from "@/server/services/scenes";
import { drain } from "@/worker/runner";
import { closeWorkerPool } from "@/worker/db";
import { fixture, newUser } from "../helpers";
import { afterAll } from "vitest";

afterAll(() => closeWorkerPool());

const SCRIPT = "تدور مكان يضبط مزاجك؟ لحظة… شوف وش لقينا! أجواء تفتح النفس، وأكل من أول نظرة يخليك تجوع. شوف الطراوة… شوف القرمشة… والله المكان هذا يستاهل التجربة. لا تفوّتك، تعال جرّب بنفسك. [اسم المطعم]… ننتظرك!";

describe("سيناريو القبول: إعلان مطعم 30 ثانية", () => {
  it("من إنشاء المشروع حتى ملف فيديو نهائي صالح", async () => {
    const u = await newUser("صاحب المطعم");
    const ws = await withUser(u.id, (tx) => currentWorkspace(tx, u.id));
    const project = await withUser(u.id, (tx) =>
      createProject(tx, u.id, ws, { brand: { name: "مطعم الجمر", business_type: "restaurant_cafe", description: "مشويات على الفحم", audience: "العائلات والشباب", city: "الرياض", differentiator: "", offer: "", contact: "" } }),
    );

    // المواد الحقيقية
    const up = (name: Parameters<typeof fixture>[0], role: "product" | "place" | "logo" | "music") =>
      ingestUpload({ userId: u.id, ws, projectId: project.id, role, name, body: fixture(name).stream(), license: role === "music" ? { source: "اختبار", commercial_use_confirmed: true } : undefined });
    const clip = await up("clip.mp4", "place");
    const clip2 = await up("clip2.mp4", "product");
    const photo = await up("photo.jpg", "product");
    const logo = await up("logo.png", "logo");
    const music = await up("music.mp3", "music");
    expect(clip.kind).toBe("video");
    expect(clip.duration_ms).toBeGreaterThan(5000);
    expect(photo.width).toBe(1600);

    // الإعدادات: مسار "لدي فكرة جاهزة" بنص المستخدم
    await withUser(u.id, (tx) =>
      updateSettings(tx, u.id, ws, project.id, { style: "trendy", duration_s: 30, goal: "attract_customers", character_type: "narrator", platform: "reels", aspect: "9:16", language: "ar_sa", mode: "own_idea", own_idea: SCRIPT }, project.version, 4),
    );

    // المخرج الإبداعي (محاكاة) عبر نظام المهام والعامل
    const { brief } = await withUser(u.id, (tx) => buildBrief(tx, project.id));
    const briefId = (await withUser(u.id, (tx) => tx.one<{ id: string }>("INSERT INTO creative_briefs (workspace_id, project_id, input, created_by) VALUES ($1, $2, $3, $4) RETURNING id", [ws.id, project.id, brief, u.id])))!.id;
    const dir = await withUser(u.id, (tx) => enqueueJob(tx, { ws, userId: u.id, projectId: project.id, type: "director", input: { mode: "direct", brief_id: briefId }, idempotencyKey: "director-acceptance-1" }));
    expect(dir.job.is_simulated).toBe(true);
    await drain();
    expect((await withUser(u.id, (tx) => getJob(tx, dir.job.id))).status).toBe("completed");

    let scenes = await withUser(u.id, (tx) => listScenes(tx, project.id));
    // الوضع الافتراضي (own_idea) بلا قالب = خمسة مشاهد لمدة 30 ثانية
    expect(scenes).toHaveLength(5);
    expect(scenes.reduce((a, s) => a + s.duration_ms, 0)).toBe(30000);
    // نص المستخدم موزّع على المشاهد واسم المطعم مُدرج بدل المتغير
    const allVo = scenes.map((s) => s.voiceover).join(" ");
    expect(allVo).toContain("تدور مكان يضبط مزاجك؟");
    expect(allVo).toContain("مطعم الجمر");
    expect(allVo).not.toContain("[اسم المطعم]");

    // التقسيم الزمني المطلوب: 0–4، 4–9، 9–16، 16–24، 24–30
    expect(scenes.map((s) => s.duration_ms)).toEqual([4000, 5000, 7000, 8000, 6000]);

    // تعديل مشهد، ورفض التعديل المتزامن القديم
    const s0 = scenes[0];
    await withUser(u.id, (tx) => updateScene(tx, ws, project.id, s0.id, { on_screen_text: "وين تتعشى الليلة؟", version: s0.version }));
    await expect(withUser(u.id, (tx) => updateScene(tx, ws, project.id, s0.id, { title: "قديم", version: s0.version }))).rejects.toMatchObject({ code: "conflict" });

    // التصدير قبل إسناد المواد يكشف المشاهد الناقصة
    const before = await withUser(u.id, (tx) => buildRenderPlan(tx, project.id, "final"));
    expect(before.problems.length).toBe(5);

    // إسناد مقاطع حقيقية للمشاهد، ومشهد واحد يُولَّد (محاكاة)
    scenes = await withUser(u.id, (tx) => listScenes(tx, project.id));
    const media = [clip.id, photo.id, clip2.id, clip.id];
    for (const [i, s] of scenes.slice(0, 4).entries()) {
      await withUser(u.id, (tx) => updateScene(tx, ws, project.id, s.id, { source_type: "upload", selected_asset_id: media[i], trim_start_ms: i === 3 ? 1000 : 0, transition: i === 0 ? "cut" : "fade", version: s.version }));
    }
    // تحديث جزئي لا يمسح الحقول غير المرسلة
    const kept = await withUser(u.id, (tx) => listScenes(tx, project.id));
    expect(kept[0].on_screen_text).toBe("وين تتعشى الليلة؟");
    expect(kept.filter((s) => s.voiceover.trim()).length).toBeGreaterThanOrEqual(4);
    const gen = await withUser(u.id, (tx) => enqueueJob(tx, { ws, userId: u.id, projectId: project.id, type: "generate_video", input: { scene_id: scenes[4].id, prompt: "logo moment", aspect: "9:16", duration_s: 6, label: "المشهد 5" }, idempotencyKey: "gen-scene5-1234" }));
    await drain();
    expect((await withUser(u.id, (tx) => getJob(tx, gen.job.id))).status).toBe("completed");

    // ترتيب المشاهد: تبديل الثاني والثالث ثم إعادتهما
    const ids = (await withUser(u.id, (tx) => listScenes(tx, project.id))).map((s) => s.id);
    const swapped = [ids[0], ids[2], ids[1], ids[3], ids[4]];
    expect((await withUser(u.id, (tx) => reorderScenes(tx, ws, project.id, swapped))).map((s) => s.id)).toEqual(swapped);
    await withUser(u.id, (tx) => reorderScenes(tx, ws, project.id, ids));

    // التعليق الصوتي لكل مشهد (محاكاة) عبر العامل
    scenes = await withUser(u.id, (tx) => listScenes(tx, project.id));
    for (const s of scenes.filter((x) => x.voiceover.trim())) {
      const audio = (await withUser(u.id, (tx) => tx.one<{ id: string }>("INSERT INTO audio_assets (workspace_id, project_id, scene_id, kind, text, offset_ms) VALUES ($1, $2, $3, 'voiceover', $4, 150) RETURNING id", [ws.id, project.id, s.id, s.voiceover])))!;
      await withUser(u.id, (tx) => enqueueJob(tx, { ws, userId: u.id, projectId: project.id, type: "generate_speech", input: { audio_id: audio.id, text: s.voiceover, voice_id: "sim-male", speed: 1, tone: "energetic" }, idempotencyKey: `tts-${s.id}` }));
    }
    await drain();
    const ready = await withUser(u.id, (tx) => tx.q("SELECT status FROM audio_assets WHERE project_id = $1", [project.id]));
    expect(ready.every((r) => r.status === "ready")).toBe(true);

    // الموسيقى والشعار والترجمة في خط المونتاج
    const tl = await withUser(u.id, (tx) => getTimeline(tx, project.id));
    await withUser(u.id, (tx) => updateTimeline(tx, u.id, ws, project.id, { ...tl.data, music_asset_id: music.id, music_volume: 0.3, logo: { asset_id: logo.id, position: "top-right", scale: 0.16 }, subtitles: true, scene_volume: 0.3 }, tl.version));

    const check = await withUser(u.id, (tx) => buildRenderPlan(tx, project.id, "final"));
    expect(check.problems).toEqual([]);
    expect(check.plan.simulationWatermark).toBe(true);

    const exp = await withUser(u.id, (tx) => enqueueJob(tx, { ws, userId: u.id, projectId: project.id, type: "export", input: { quality: "final", aspect: "9:16" }, idempotencyKey: "export-final-acceptance" }));
    await drain();
    const done = await withUser(u.id, (tx) => getJob(tx, exp.job.id));
    expect(done.error).toBeNull();
    expect(done.status).toBe("completed");

    const row = await withUser(u.id, (tx) => tx.one<{ storage_key: string; is_simulated: boolean }>("SELECT m.storage_key, e.is_simulated FROM exports e JOIN media_assets m ON m.id = e.asset_id WHERE e.job_id = $1", [exp.job.id]));
    expect(row!.is_simulated).toBe(true);
    const p = await probe(await storage().localPath(row!.storage_key));
    expect(p.width).toBe(1080);
    expect(p.height).toBe(1920);
    expect(p.hasAudio).toBe(true);
    expect(Math.abs((p.durationMs ?? 0) - 30000)).toBeLessThan(250);

    const status = await withUser(u.id, (tx) => tx.one<{ status: string }>("SELECT status FROM projects WHERE id = $1", [project.id]));
    expect(status!.status).toBe("exported");
  });

  it("فشل مهمة لا يُسقط المشروع: ملف مشهد محذوف يظهر كمشكلة واضحة", async () => {
    const u = await newUser("مستخدم");
    const ws = await withUser(u.id, (tx) => currentWorkspace(tx, u.id));
    const project = await withUser(u.id, (tx) => createProject(tx, u.id, ws, { brand: { name: "متجر", business_type: "fashion", description: "", audience: "", city: "", differentiator: "", offer: "", contact: "" } }));
    const photo = await ingestUpload({ userId: u.id, ws, projectId: project.id, role: "product", name: "p.png", body: fixture("photo.png").stream() });
    const scene = (await withUser(u.id, (tx) => tx.one<{ id: string; version: number }>("INSERT INTO scenes (workspace_id, project_id, position, title, duration_ms, selected_asset_id, source_type) VALUES ($1, $2, 0, 'مشهد', 3000, $3, 'upload') RETURNING id, version", [ws.id, project.id, photo.id])))!;
    await storage().remove(photo.storage_key);
    const r = await withUser(u.id, (tx) => buildRenderPlan(tx, project.id, "final"));
    expect(r.problems[0].message).toContain("مفقود");
    // التصدير عبر العامل يفشل برسالة مفهومة دون استثناء غير معالج
    const exp = await withUser(u.id, (tx) => enqueueJob(tx, { ws, userId: u.id, projectId: project.id, type: "export", input: { quality: "final" }, idempotencyKey: "export-missing-file" }));
    await drain();
    const job = await withUser(u.id, (tx) => getJob(tx, exp.job.id));
    expect(job.status).toBe("failed");
    expect(job.error).toContain("مفقود");
    void scene;
  });

  it("يرفض الملفات غير المدعومة والمحتوى الخطِر", async () => {
    const u = await newUser("مستخدم");
    const ws = await withUser(u.id, (tx) => currentWorkspace(tx, u.id));
    const project = await withUser(u.id, (tx) => createProject(tx, u.id, ws, { brand: { name: "نشاط", business_type: "other", description: "", audience: "", city: "", differentiator: "", offer: "", contact: "" } }));
    await expect(ingestUpload({ userId: u.id, ws, projectId: project.id, role: "product", name: "evil.jpg", body: fixture("fake.txt").stream() })).rejects.toMatchObject({ code: "invalid" });
    await expect(ingestUpload({ userId: u.id, ws, projectId: project.id, role: "logo", name: "logo.mp4", body: fixture("clip2.mp4").stream() })).rejects.toMatchObject({ code: "invalid" });
    const left = await withUser(u.id, (tx) => tx.q("SELECT id FROM media_assets WHERE project_id = $1", [project.id]));
    expect(left).toHaveLength(0);
  });
});
