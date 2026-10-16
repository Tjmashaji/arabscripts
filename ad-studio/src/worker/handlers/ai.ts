// معالجات المهام: المخرج الإبداعي، تحليل الوسائط، توليد الفيديو والصور، التعليق الصوتي.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { Tx } from "../../server/db";
import { ffmpeg } from "../../server/media/ffmpeg";
import { probe } from "../../server/media/probe";
import { sniff } from "../../server/media/sniff";
import { newKey, storage } from "../../server/media/storage";
import { analysisProvider, directorProvider, imageProvider, speechProvider, videoProvider } from "../../server/providers/registry";
import { ProviderError, type DirectorBrief } from "../../server/providers/types";
import { saveDirectorOutput } from "../../server/services/scenes";
import type { ClaimedJob, StepResult } from "../types";

const TMP = path.join(os.tmpdir(), "ad-studio-worker");

export async function storeFile(tx: Tx, job: ClaimedJob, src: { localFile?: string; url?: string; buffer?: Buffer }, meta: { role: string; name: string; simulated: boolean; license: object }) {
  const store = storage();
  const key = newKey(job.workspace_id, job.project_id, "bin");
  const body = src.buffer
    ? Readable.from(src.buffer)
    : src.localFile
      ? createReadStream(src.localFile)
      : await (async () => {
          const res = await fetch(src.url!, { signal: AbortSignal.timeout(300_000) });
          if (!res.ok || !res.body) throw new ProviderError(`download ${res.status}`, true, "تعذّر تنزيل الملف الناتج من المزود.");
          return Readable.fromWeb(res.body as unknown as WebReadableStream);
        })();
  const put = await store.put(key, body, 1024 * 1024 * 1024);
  const kind = sniff(put.head);
  if (!kind) {
    await store.remove(key);
    throw new ProviderError("unknown output type", false, "الملف الناتج من المزود بصيغة غير مدعومة.");
  }
  const finalKey = key.replace(/\.bin$/, `.${kind.ext}`);
  const { rename } = await import("node:fs/promises");
  await rename(await store.localPath(key), await store.localPath(finalKey));
  const p = await probe(await store.localPath(finalKey));
  const row = await tx.one<{ id: string }>(
    `INSERT INTO media_assets (workspace_id, project_id, kind, role, storage_key, original_name, mime_type, size_bytes, checksum_sha256, width, height, duration_ms, is_simulated, license, created_by, analysis_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'none') RETURNING id`,
    [job.workspace_id, job.project_id, kind.kind, meta.role, finalKey, meta.name, kind.mime, put.size, put.sha256, p.width ?? null, p.height ?? null, p.durationMs ?? null, meta.simulated, meta.license, job.user_id],
  );
  return { id: row!.id, durationMs: p.durationMs ?? null };
}

export async function directorStep(tx: Tx, job: ClaimedJob): Promise<StepResult> {
  const provider = directorProvider();
  if (!provider) throw new ProviderError("no director", false, "المخرج الإبداعي غير متصل.");
  const brief = (await tx.one<{ input: DirectorBrief }>("SELECT input FROM creative_briefs WHERE id = $1", [job.input.brief_id]))?.input;
  if (!brief) throw new ProviderError("brief missing", false, "ملخص الإعلان غير موجود.");
  if (job.input.mode === "ideas") {
    const r = await provider.ideas(brief);
    return { kind: "done", output: { ideas: r.ideas }, cost: r };
  }
  const r = await provider.direct(brief);
  const saved = await saveDirectorOutput(tx, {
    wsId: job.workspace_id,
    projectId: job.project_id!,
    userId: job.user_id,
    output: r.output,
    source: provider.info.mode === "simulation" ? "simulation" : "ai",
    provider: `${provider.info.id}:${r.model}`,
    briefId: String(job.input.brief_id),
  });
  return { kind: "done", output: { script_version: saved.version, scenes: r.output.scenes.length }, cost: r };
}

// إطارات من الصورة أو الفيديو مصغّرة إلى 1024 بكسل كحد أقصى، بصيغة JPEG
async function frames(file: string, kind: string, durationMs: number | null) {
  await mkdir(TMP, { recursive: true });
  const times = kind === "video" ? [0.1, 0.5, 0.9].map((r) => ((durationMs ?? 1000) / 1000) * r) : [0];
  const out: string[] = [];
  for (const t of times) {
    const f = path.join(TMP, `${randomUUID()}.jpg`);
    const args = kind === "video" ? ["-ss", t.toFixed(2), "-i", file] : ["-i", file];
    await ffmpeg([...args, "-frames:v", "1", "-vf", "scale='min(1024,iw)':-2", "-q:v", "4", f], { timeoutMs: 60_000 });
    out.push(f);
  }
  return out;
}

export async function analyzeStep(tx: Tx, job: ClaimedJob): Promise<StepResult> {
  const provider = analysisProvider();
  if (!provider) throw new ProviderError("no analysis", false, "خدمة التحليل غير متصلة.");
  const a = await tx.one<{ id: string; kind: string; role: string; storage_key: string; duration_ms: number | null; project_id: string }>("SELECT * FROM media_assets WHERE id = $1 AND workspace_id = $2", [job.input.asset_id, job.workspace_id]);
  if (!a) throw new ProviderError("asset missing", false, "الملف غير موجود.");
  if (a.kind === "audio") {
    await tx.q("UPDATE media_assets SET analysis_status = 'unavailable' WHERE id = $1", [a.id]);
    return { kind: "done", output: { skipped: "audio" }, cost: { costCents: 0, costIsEstimate: false } };
  }
  const business = (await tx.one<{ name: string }>("SELECT b.name FROM projects p JOIN brands b ON b.id = p.brand_id WHERE p.id = $1", [a.project_id]))?.name ?? "";
  const files = await frames(await storage().localPath(a.storage_key), a.kind, a.duration_ms);
  try {
    const images = await Promise.all(files.map(async (f) => ({ mime: "image/jpeg" as const, base64: (await readFile(f)).toString("base64") })));
    const r = await provider.analyze(images, { kind: a.kind, role: a.role, business });
    await tx.q("UPDATE media_assets SET analysis = $2, analysis_status = 'done' WHERE id = $1", [a.id, r.analysis]);
    return { kind: "done", output: { asset_id: a.id }, cost: r };
  } finally {
    await Promise.all(files.map((f) => rm(f, { force: true })));
  }
}

async function referenceDataUri(tx: Tx, assetId: string | undefined, workspaceId: string) {
  if (!assetId) return undefined;
  const a = await tx.one<{ storage_key: string; kind: string; duration_ms: number | null }>("SELECT storage_key, kind, duration_ms FROM media_assets WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL", [assetId, workspaceId]);
  if (!a || a.kind === "audio") return undefined;
  const [f] = await frames(await storage().localPath(a.storage_key), a.kind, a.duration_ms);
  try {
    const buf = await readFile(f);
    // حد Runway للصورة المضمّنة 5 ميغابايت
    if ((await stat(f)).size > 5 * 1024 * 1024) return undefined;
    return { dataUri: `data:image/jpeg;base64,${buf.toString("base64")}` };
  } finally {
    await rm(f, { force: true });
  }
}

export async function generateStep(tx: Tx, job: ClaimedJob, kind: "video" | "image"): Promise<StepResult> {
  const provider = kind === "video" ? videoProvider() : imageProvider();
  if (!provider || provider.info.id !== job.provider) throw new ProviderError("provider changed", false, "تغيّر مزود التوليد منذ إنشاء المهمة. أعد التوليد.");
  const i = job.input as { scene_id: string; prompt: string; negative_prompt?: string; aspect: "9:16"; duration_s: number; reference_asset_id?: string; label: string };
  if (!job.provider_job_id) {
    const ref = provider.capabilities.supportsReferenceImage ? await referenceDataUri(tx, i.reference_asset_id, job.workspace_id) : undefined;
    const sub = await provider.submit({ prompt: i.prompt, negativePrompt: i.negative_prompt, aspect: i.aspect, durationS: i.duration_s, referenceImage: ref, label: i.label });
    return { kind: "wait", delaySeconds: job.is_simulated ? 0 : 10, progress: null, label: "أُرسل الطلب إلى المزود", providerJobId: sub.providerJobId, output: { estimated_cost: sub.estimatedCost ?? null } };
  }
  const r = await provider.poll(job.provider_job_id);
  if (r.state !== "succeeded") {
    if ("error" in r) throw new ProviderError(r.error, r.retryable, r.error);
    return { kind: "wait", delaySeconds: 10, progress: r.progress, label: r.label };
  }
  const asset = await storeFile(tx, job, r.output, { role: "generated", name: `${i.label}.${kind === "video" ? "mp4" : "png"}`, simulated: job.is_simulated, license: { source: job.provider, generated: true } });
  await tx.q(
    "INSERT INTO scene_generations (workspace_id, scene_id, job_id, kind, provider, prompt, params, result_asset_id, is_simulated) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [job.workspace_id, i.scene_id, job.id, kind, job.provider, i.prompt, { aspect: i.aspect, duration_s: i.duration_s, reference_asset_id: i.reference_asset_id ?? null }, asset.id, job.is_simulated],
  );
  // يصبح الناتج هو مصدر المشهد (يمكن للمستخدم استبداله لاحقًا)
  await tx.q("UPDATE scenes SET selected_asset_id = $2, source_type = 'generate', trim_start_ms = 0, version = version + 1 WHERE id = $1 AND deleted_at IS NULL", [i.scene_id, asset.id]);
  await tx.q("UPDATE projects SET status = CASE WHEN status IN ('draft', 'scripting') THEN 'producing' ELSE status END WHERE id = $1", [job.project_id]);
  const est = (job.output?.estimated_cost ?? null) as { costCents: number | null; costIsEstimate: boolean } | null;
  return { kind: "done", output: { asset_id: asset.id }, cost: r.cost.costCents !== null ? r.cost : (est ?? { costCents: null, costIsEstimate: true }) };
}

export async function speechStep(tx: Tx, job: ClaimedJob): Promise<StepResult> {
  const provider = speechProvider();
  if (!provider || provider.info.id !== job.provider) throw new ProviderError("provider changed", false, "تغيّر مزود الصوت منذ إنشاء المهمة. أعد التوليد.");
  const i = job.input as { audio_id: string; text: string; voice_id: string; speed: number; tone: string };
  const r = await provider.synthesize({ text: i.text, voiceId: i.voice_id, speed: i.speed, tone: i.tone });
  const asset = await storeFile(tx, job, { buffer: r.audio }, { role: "generated", name: `voice-${i.audio_id.slice(0, 8)}.${r.ext}`, simulated: job.is_simulated, license: { source: job.provider, generated: true, voice_id: i.voice_id } });
  await tx.q("UPDATE audio_assets SET asset_id = $2, status = 'ready', is_simulated = $3, job_id = $4 WHERE id = $1", [i.audio_id, asset.id, job.is_simulated, job.id]);
  return { kind: "done", output: { asset_id: asset.id, duration_ms: asset.durationMs }, cost: r };
}
