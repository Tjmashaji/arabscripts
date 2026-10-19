// منطق المشاريع: كل دالة تتحقق من ملكية المستخدم للمشروع قبل أي قراءة أو تعديل.
import { randomUUID } from "node:crypto";
import { BACKGROUNDS, CATEGORIES, sceneDurationMs, type Age, type Category, type Music, type NewProject, type Scene, type SceneInput, type VoiceMode, type YoutubeMeta } from "@/lib/domain";
import { buildLesson } from "@/lib/lessons";
import { now, q, tx } from "../db";
import { errors } from "../http/errors";
import { removeProject } from "../storage";

type Row = {
  id: string; user_id: string; title: string; category: Category; subject: string; age: Age; voice_mode: VoiceMode; music: Music;
  scenes: string; youtube: string; version: number; created_at: number; updated_at: number;
};
type AudioRow = { scene_id: string; file: string; duration_ms: number; source: "ai" | "recorded"; text: string };

export type Project = {
  id: string; title: string; category: Category; subject: string; age: Age; voiceMode: VoiceMode; music: Music;
  scenes: Scene[]; youtube: YoutubeMeta; version: number; createdAt: number; updatedAt: number;
};

function hydrate(r: Row): Project {
  const audio = new Map(q.all<AudioRow>("SELECT scene_id, file, duration_ms, source, text FROM scene_audio WHERE project_id = ?", r.id).map((a) => [a.scene_id, a]));
  const scenes = (JSON.parse(r.scenes) as SceneInput[]).map((s, i) => {
    const a = audio.get(s.id);
    return { ...s, position: i, audio: a ? { file: a.file, durationMs: a.duration_ms, source: a.source, text: a.text } : null };
  });
  return {
    id: r.id, title: r.title, category: r.category, subject: r.subject, age: r.age, voiceMode: r.voice_mode, music: r.music,
    scenes, youtube: JSON.parse(r.youtube), version: r.version, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function getProject(userId: string, id: string): Project {
  const r = q.get<Row>("SELECT * FROM projects WHERE id = ? AND user_id = ?", id, userId);
  if (!r) throw errors.notFound("المشروع");
  return hydrate(r);
}

// للعامل: يقرأ المشروع بمعرّفه فقط (المهمة نفسها مربوطة بالمستخدم)
export function getProjectById(id: string): Project & { userId: string } {
  const r = q.get<Row>("SELECT * FROM projects WHERE id = ?", id);
  if (!r) throw new Error("المشروع غير موجود");
  return { ...hydrate(r), userId: r.user_id };
}

export function listProjects(userId: string) {
  return q.all<Row>("SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 200", userId).map((r) => {
    const scenes = JSON.parse(r.scenes) as SceneInput[];
    const render = q.get<{ id: string; thumb: string; duration_ms: number }>("SELECT id, thumb, duration_ms FROM renders WHERE project_id = ? ORDER BY created_at DESC LIMIT 1", r.id);
    const upload = q.get<{ status: string; video_id: string | null }>("SELECT status, video_id FROM uploads WHERE project_id = ? ORDER BY created_at DESC LIMIT 1", r.id);
    return { id: r.id, title: r.title, category: r.category, age: r.age, sceneCount: scenes.length, cover: scenes[0] ?? null, render: render ?? null, upload: upload ?? null, updatedAt: r.updated_at };
  });
}

export function blankScenes(): SceneInput[] {
  return [0, 1, 2].map((i) => ({ id: `s${i + 1}`, narration: "", text: "", emoji: [], bg: BACKGROUNDS[i * 3] }));
}

// ينشئ المشروع. الدروس الجاهزة تُبنى فورًا؛ الموضوع المخصص يُترك للمخرج الذكي (needsScript)
export function createProject(userId: string, input: NewProject, opts: { claude: boolean }) {
  const id = randomUUID();
  let title = input.subject.slice(0, 80);
  let scenes: SceneInput[] = [];
  let youtube: YoutubeMeta = { title: "", description: "", tags: [] };
  let needsScript = false;
  if (CATEGORIES[input.category].builtin) {
    const lesson = buildLesson(input.category, input.subject, input.age);
    if (!lesson) throw errors.invalid("الموضوع المختار غير متاح في هذا المجال.");
    ({ title, scenes, youtube } = lesson);
  } else if (opts.claude) {
    needsScript = true;
  } else {
    scenes = blankScenes();
  }
  const t = now();
  q.run(
    "INSERT INTO projects (id, user_id, title, category, subject, age, voice_mode, music, scenes, youtube, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, userId, title, input.category, input.subject, input.age, input.voiceMode, input.music, JSON.stringify(scenes), JSON.stringify(youtube), t, t,
  );
  return { id, needsScript };
}

export function updateProject(userId: string, id: string, patch: { title?: string; voiceMode?: VoiceMode; music?: Music; scenes?: SceneInput[]; youtube?: YoutubeMeta }) {
  const p = getProject(userId, id);
  tx(() => {
    q.run(
      "UPDATE projects SET title = ?, voice_mode = ?, music = ?, scenes = ?, youtube = ?, version = version + 1, updated_at = ? WHERE id = ?",
      patch.title ?? p.title,
      patch.voiceMode ?? p.voiceMode,
      patch.music ?? p.music,
      JSON.stringify(patch.scenes ?? p.scenes.map(({ id, narration, text, emoji, bg }) => ({ id, narration, text, emoji, bg }))),
      JSON.stringify(patch.youtube ?? p.youtube),
      now(),
      id,
    );
    // حذف صوت المشاهد المحذوفة (الملفات تبقى حتى حذف المشروع)
    if (patch.scenes) {
      const keep = new Set(patch.scenes.map((s) => s.id));
      for (const s of p.scenes) if (!keep.has(s.id) && s.audio) q.run("DELETE FROM scene_audio WHERE project_id = ? AND scene_id = ?", id, s.id);
    }
  });
  return getProject(userId, id);
}

// يستبدل المشاهد من ناتج المخرج الذكي (يُستدعى من العامل)
export function applyScript(projectId: string, out: { title: string; scenes: SceneInput[]; youtube: YoutubeMeta }) {
  tx(() => {
    q.run("DELETE FROM scene_audio WHERE project_id = ?", projectId);
    q.run("UPDATE projects SET title = ?, scenes = ?, youtube = ?, version = version + 1, updated_at = ? WHERE id = ?", out.title, JSON.stringify(out.scenes), JSON.stringify(out.youtube), now(), projectId);
  });
}

export function setSceneAudio(projectId: string, sceneId: string, a: { file: string; durationMs: number; source: "ai" | "recorded"; text: string }) {
  q.run(
    "INSERT INTO scene_audio (project_id, scene_id, file, duration_ms, source, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, scene_id) DO UPDATE SET file = excluded.file, duration_ms = excluded.duration_ms, source = excluded.source, text = excluded.text, created_at = excluded.created_at",
    projectId, sceneId, a.file, a.durationMs, a.source, a.text, now(),
  );
  q.run("UPDATE projects SET version = version + 1, updated_at = ? WHERE id = ?", now(), projectId);
}

export function clearSceneAudio(userId: string, projectId: string, sceneId: string) {
  getProject(userId, projectId);
  q.run("DELETE FROM scene_audio WHERE project_id = ? AND scene_id = ?", projectId, sceneId);
  q.run("UPDATE projects SET version = version + 1, updated_at = ? WHERE id = ?", now(), projectId);
}

export async function deleteProject(userId: string, id: string) {
  getProject(userId, id);
  q.run("DELETE FROM projects WHERE id = ?", id);
  await removeProject(id);
}

// الصوت صالح فقط إذا سُجّل للنص الحالي نفسه
export const audioFresh = (s: Scene) => Boolean(s.audio && s.audio.text.trim() === s.narration.trim());

// فحص قبل التصدير: يعيد المشاكل بالعربية بدل أن يفشل FFmpeg لاحقًا برسالة غامضة
export function renderIssues(p: Project) {
  const issues: string[] = [];
  if (p.scenes.length < 2) issues.push("أضف مشهدين على الأقل.");
  p.scenes.forEach((s, i) => {
    const n = i + 1;
    if (!s.text.trim() && !s.emoji.length && !s.narration.trim()) issues.push(`المشهد ${n} فارغ.`);
    if (p.voiceMode !== "none") {
      if (!s.narration.trim()) return;
      if (!s.audio) issues.push(`المشهد ${n} بلا صوت. ${p.voiceMode === "ai" ? "ولّد الصوت" : "سجّل الصوت"} أولًا.`);
      else if (!audioFresh(s)) issues.push(`صوت المشهد ${n} لا يطابق التعليق بعد تعديله. أعد ${p.voiceMode === "ai" ? "توليده" : "تسجيله"}.`);
    }
  });
  const total = p.scenes.reduce((a, s) => a + sceneDurationMs({ ...s, audio: p.voiceMode === "none" ? null : s.audio }), 0);
  if (total > 90_000) issues.push(`مدة المقطع ${Math.round(total / 1000)} ثانية. المقاطع القصيرة للأطفال يجب ألا تتجاوز 90 ثانية.`);
  return issues;
}
