// المسار المجاني بالكامل: نص المستخدم + مواده الحقيقية + صوت مجاني أو تسجيله، دون أي مفتاح.
// النتيجة إعلان حقيقي بلا وسم محاكاة.
// الصوت المجاني (edge-tts) يحتاج شبكة، فيُختبر فقط عند FREE_TTS=true؛ وإلا يُستخدم تسجيل مرفوع.
import { afterAll, describe, expect, it } from "vitest";
import { withUser } from "@/server/db";
import { probe } from "@/server/media/probe";
import { storage } from "@/server/media/storage";
import { directorProvider, speechProvider } from "@/server/providers/registry";
import { buildBrief } from "@/server/services/brief";
import { createProject, currentWorkspace, updateSettings } from "@/server/services/core";
import { buildRenderPlan } from "@/server/services/export";
import { enqueueJob, getJob } from "@/server/services/jobs";
import { ingestUpload } from "@/server/services/media";
import { listScenes, updateScene } from "@/server/services/scenes";
import { closeWorkerPool } from "@/worker/db";
import { drain } from "@/worker/runner";
import { fixture, newUser } from "../helpers";

afterAll(() => closeWorkerPool());

const SCRIPT = "جوعان؟ عندنا المندي على أصوله. لحم طري ورز مبهّر. [اسم المطعم] بانتظارك اليوم.";

describe("المسار المجاني", () => {
  it("نص المستخدم ومواده تنتج إعلانًا حقيقيًا بلا وسم محاكاة", async () => {
    const u = await newUser("صاحب مطعم");
    const ws = await withUser(u.id, (tx) => currentWorkspace(tx, u.id));
    const project = await withUser(u.id, (tx) =>
      createProject(tx, u.id, ws, { brand: { name: "مطعم الجمر", business_type: "restaurant_cafe", description: "", audience: "", city: "", differentiator: "", offer: "", contact: "" } }),
    );
    const up = (name: Parameters<typeof fixture>[0], role: "product" | "place" | "voice") => ingestUpload({ userId: u.id, ws, projectId: project.id, role, name, body: fixture(name).stream() });
    const clip = await up("clip.mp4", "place");
    const photo = await up("photo.jpg", "product");
    await withUser(u.id, (tx) => updateSettings(tx, u.id, ws, project.id, { duration_s: 15, aspect: "9:16", mode: "own_idea", own_idea: SCRIPT }, project.version, 4));

    // المخرج المجاني يُختار تلقائيًا لنص المستخدم، ومهمته ليست محاكاة
    const provider = directorProvider({ ownScript: true });
    expect(provider.info).toMatchObject({ id: "manual", free: true });
    const { brief } = await withUser(u.id, (tx) => buildBrief(tx, project.id));
    const briefId = (await withUser(u.id, (tx) => tx.one<{ id: string }>("INSERT INTO creative_briefs (workspace_id, project_id, input, created_by) VALUES ($1, $2, $3, $4) RETURNING id", [ws.id, project.id, brief, u.id])))!.id;
    const dir = await withUser(u.id, (tx) => enqueueJob(tx, { ws, userId: u.id, projectId: project.id, type: "director", input: { mode: "direct", brief_id: briefId }, idempotencyKey: "director-free-path-1", provider }));
    expect(dir.job.is_simulated).toBe(false);
    await drain();
    expect((await withUser(u.id, (tx) => getJob(tx, dir.job.id))).status).toBe("completed");

    let scenes = await withUser(u.id, (tx) => listScenes(tx, project.id));
    expect(scenes.reduce((a, s) => a + s.duration_ms, 0)).toBe(15000);
    expect(scenes.map((s) => s.voiceover).join(" ")).toContain("مطعم الجمر بانتظارك اليوم.");

    // مواد حقيقية لكل المشاهد
    for (const [i, s] of scenes.entries()) {
      await withUser(u.id, (tx) => updateScene(tx, ws, project.id, s.id, { source_type: "upload", selected_asset_id: i % 2 ? photo.id : clip.id, version: s.version }));
    }

    // التعليق الصوتي: مجاني عبر edge-tts إن كان مفعّلًا، وإلا تسجيل المستخدم
    scenes = await withUser(u.id, (tx) => listScenes(tx, project.id));
    const speech = speechProvider();
    if (speech?.info.id === "edge-tts") {
      for (const s of scenes.filter((x) => x.voiceover.trim())) {
        const audio = (await withUser(u.id, (tx) => tx.one<{ id: string }>("INSERT INTO audio_assets (workspace_id, project_id, scene_id, kind, text) VALUES ($1, $2, $3, 'voiceover', $4) RETURNING id", [ws.id, project.id, s.id, s.voiceover])))!;
        const j = await withUser(u.id, (tx) => enqueueJob(tx, { ws, userId: u.id, projectId: project.id, type: "generate_speech", input: { audio_id: audio.id, text: s.voiceover, voice_id: "ar-SA-HamedNeural", speed: 1, tone: "energetic" }, idempotencyKey: `free-tts-${s.id}` }));
        expect(j.job.is_simulated).toBe(false);
      }
      await drain();
      const rows = await withUser(u.id, (tx) => tx.q<{ status: string; is_simulated: boolean }>("SELECT status, is_simulated FROM audio_assets WHERE project_id = $1", [project.id]));
      expect(rows.every((r) => r.status === "ready" && !r.is_simulated)).toBe(true);
    } else {
      const rec = await up("music.mp3", "voice");
      await withUser(u.id, (tx) => tx.q("INSERT INTO audio_assets (workspace_id, project_id, scene_id, kind, text, asset_id, status) VALUES ($1, $2, $3, 'voiceover', '', $4, 'ready')", [ws.id, project.id, scenes[0].id, rec.id]));
    }

    const check = await withUser(u.id, (tx) => buildRenderPlan(tx, project.id, "final"));
    expect(check.problems).toEqual([]);
    expect(check.plan.simulationWatermark).toBe(false);

    const exp = await withUser(u.id, (tx) => enqueueJob(tx, { ws, userId: u.id, projectId: project.id, type: "export", input: { quality: "final", aspect: "9:16" }, idempotencyKey: "export-free-path-1" }));
    await drain();
    const done = await withUser(u.id, (tx) => getJob(tx, exp.job.id));
    expect(done.error).toBeNull();
    const row = await withUser(u.id, (tx) => tx.one<{ storage_key: string; is_simulated: boolean }>("SELECT m.storage_key, e.is_simulated FROM exports e JOIN media_assets m ON m.id = e.asset_id WHERE e.job_id = $1", [exp.job.id]));
    expect(row!.is_simulated).toBe(false);
    const p = await probe(await storage().localPath(row!.storage_key));
    expect(p.hasAudio).toBe(true);
    expect(Math.abs((p.durationMs ?? 0) - 15000)).toBeLessThan(250);
  });
});
