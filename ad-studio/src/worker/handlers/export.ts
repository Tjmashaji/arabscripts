// مهمة التصدير: تبني الخطة من قاعدة البيانات، تشغّل FFmpeg خارج أي معاملة طويلة،
// ثم تحفظ الملف الناتج وسجل التصدير في معاملة قصيرة.
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { render } from "../../server/media/render";
import { ProviderError } from "../../server/providers/types";
import { buildRenderPlan } from "../../server/services/export";
import { workerTx } from "../db";
import type { ClaimedJob, StepResult } from "../types";
import { storeFile } from "./ai";

export async function exportStep(job: ClaimedJob, progress: (p: number | null, label: string) => Promise<void>): Promise<StepResult> {
  const quality = job.input.quality === "preview" ? "preview" : "final";
  const { plan, problems, timelineVersion } = await workerTx((tx) => buildRenderPlan(tx, job.project_id!, quality));
  if (problems.length) throw new ProviderError("export problems", false, problems.map((p) => p.message).join(" — "));
  await progress(0, "يُجمَّع الفيديو");
  const dir = path.join(os.tmpdir(), "ad-studio-export");
  await mkdir(dir, { recursive: true });
  const out = path.join(dir, `${randomUUID()}.mp4`);
  let last = 0;
  try {
    const r = await render(plan, out, (f) => {
      const pct = Math.round(f * 100);
      if (pct - last >= 5) {
        last = pct;
        void progress(pct, "يُجمَّع الفيديو");
      }
    });
    return await workerTx(async (tx) => {
      const asset = await storeFile(tx, job, { localFile: out }, { role: "export", name: `export-${quality}.mp4`, simulated: plan.simulationWatermark, license: { source: "export" } });
      await tx.q(
        "INSERT INTO exports (workspace_id, project_id, job_id, asset_id, aspect, width, height, duration_ms, timeline_version, settings_snapshot, is_simulated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        [job.workspace_id, job.project_id, job.id, asset.id, job.input.aspect ?? "9:16", r.width, r.height, r.durationMs, timelineVersion, { quality, scenes: plan.scenes.length, voice: plan.voice.length, music: Boolean(plan.music), logo: Boolean(plan.logo) }, plan.simulationWatermark],
      );
      if (quality === "final") await tx.q("UPDATE projects SET status = 'exported', wizard_step = 6 WHERE id = $1", [job.project_id]);
      return { kind: "done" as const, output: { asset_id: asset.id, width: r.width, height: r.height, duration_ms: r.durationMs, quality }, cost: { costCents: 0, costIsEstimate: false } };
    });
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError((e as Error).message, false, `فشل التصدير: ${(e as Error).message}`);
  } finally {
    await rm(out, { force: true });
  }
}
