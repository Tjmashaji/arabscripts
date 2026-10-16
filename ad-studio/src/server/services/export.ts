// تحويل حالة المشروع في قاعدة البيانات إلى خطة تصدير قابلة للتنفيذ، مع اكتشاف المشاكل قبل البدء
// (مشهد بلا مادة، ملف محذوف أو غير صالح) حتى يرى المستخدم السبب بدل فشل غامض.
import { access } from "node:fs/promises";
import { ASPECT_SIZE } from "@/lib/domain";
import type { Tx } from "../db";
import { probe } from "../media/probe";
import type { RenderPlan } from "../media/render";
import { storage } from "../media/storage";
import { getTimeline, listScenes } from "./scenes";

export type ExportProblem = { scene_id?: string; position?: number; message: string };

export async function buildRenderPlan(tx: Tx, projectId: string, quality: "final" | "preview"): Promise<{ plan: RenderPlan; problems: ExportProblem[]; timelineVersion: number }> {
  const { version, data } = await getTimeline(tx, projectId);
  const scenes = await listScenes(tx, projectId);
  const problems: ExportProblem[] = [];
  if (!scenes.length) problems.push({ message: "لا توجد مشاهد. أنشئ السيناريو والمشاهد أولًا." });
  const ids = [...new Set([...scenes.map((s) => s.selected_asset_id), data.music_asset_id, data.logo.asset_id].filter(Boolean))] as string[];
  const assets = new Map(
    (await tx.q<{ id: string; kind: string; storage_key: string; duration_ms: number | null; is_simulated: boolean; deleted_at: string | null }>("SELECT id, kind, storage_key, duration_ms, is_simulated, deleted_at FROM media_assets WHERE id = ANY($1)", [ids])).map((a) => [a.id, a]),
  );
  const exists = async (key: string) => access(await storage().localPath(key)).then(() => true, () => false);
  let simulated = false;
  const planScenes: RenderPlan["scenes"] = [];
  for (const s of scenes) {
    const a = s.selected_asset_id ? assets.get(s.selected_asset_id) : undefined;
    if (!a || a.deleted_at || a.kind === "audio") {
      problems.push({ scene_id: s.id, position: s.position, message: `المشهد ${s.position + 1} «${s.title}» بلا صورة أو مقطع. ارفع مادة أو ولّد المشهد.` });
      continue;
    }
    if (!(await exists(a.storage_key))) {
      problems.push({ scene_id: s.id, position: s.position, message: `ملف المشهد ${s.position + 1} مفقود من التخزين. استبدله.` });
      continue;
    }
    simulated ||= a.is_simulated;
    const file = await storage().localPath(a.storage_key);
    let hasAudio = false;
    if (a.kind === "video") {
      try {
        hasAudio = (await probe(file)).hasAudio;
      } catch {
        problems.push({ scene_id: s.id, position: s.position, message: `ملف المشهد ${s.position + 1} غير صالح. استبدله.` });
        continue;
      }
    }
    planScenes.push({
      file,
      kind: a.kind as "video" | "image",
      hasAudio,
      durationMs: s.duration_ms,
      sourceDurationMs: a.duration_ms,
      trimStartMs: a.kind === "video" ? Math.min(s.trim_start_ms, Math.max(0, (a.duration_ms ?? 0) - 500)) : 0,
      transition: s.transition as RenderPlan["scenes"][number]["transition"],
      onScreenText: s.on_screen_text,
    });
  }

  // بداية كل مشهد على الخط الزمني لمحاذاة التعليق الصوتي
  const startOf = new Map<string, number>();
  let t = 0;
  for (const s of scenes) {
    startOf.set(s.id, t);
    t += s.duration_ms;
  }
  const voices = await tx.q<{ scene_id: string | null; offset_ms: number; volume: string; text: string; storage_key: string; duration_ms: number | null; is_simulated: boolean }>(
    `SELECT a.scene_id, a.offset_ms, a.volume, a.text, m.storage_key, m.duration_ms, m.is_simulated FROM audio_assets a JOIN media_assets m ON m.id = a.asset_id AND m.deleted_at IS NULL
     WHERE a.project_id = $1 AND a.kind = 'voiceover' AND a.status = 'ready' AND (a.scene_id IS NULL OR a.scene_id IN (SELECT id FROM scenes WHERE project_id = $1 AND deleted_at IS NULL))`,
    [projectId],
  );
  const voice: RenderPlan["voice"] = [];
  for (const v of voices) {
    if (!(await exists(v.storage_key))) continue;
    simulated ||= v.is_simulated;
    voice.push({ file: await storage().localPath(v.storage_key), offsetMs: (v.scene_id ? (startOf.get(v.scene_id) ?? 0) : 0) + v.offset_ms, volume: Number(v.volume) * data.voice_volume, text: v.text, durationMs: v.duration_ms });
  }

  const music = data.music_asset_id ? assets.get(data.music_asset_id) : undefined;
  if (data.music_asset_id && (!music || music.deleted_at)) problems.push({ message: "ملف الموسيقى المختار لم يعد موجودًا." });
  const logo = data.logo.asset_id ? assets.get(data.logo.asset_id) : undefined;
  if (data.logo.asset_id && (!logo || logo.deleted_at)) problems.push({ message: "ملف الشعار المختار لم يعد موجودًا." });

  const size = ASPECT_SIZE[data.aspect];
  return {
    timelineVersion: version,
    problems,
    plan: {
      ...size,
      fps: 30,
      scenes: planScenes,
      voice,
      music: music && !music.deleted_at ? { file: await storage().localPath(music.storage_key), volume: data.music_volume, duck: data.duck_music } : null,
      sceneVolume: data.scene_volume,
      subtitles: data.subtitles,
      textStyle: data.text_style,
      logo: logo && !logo.deleted_at ? { file: await storage().localPath(logo.storage_key), position: data.logo.position, scale: data.logo.scale } : null,
      simulationWatermark: simulated,
      quality,
    },
  };
}
