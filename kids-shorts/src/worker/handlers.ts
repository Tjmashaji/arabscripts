// تنفيذ المهام في العامل الخلفي. كل معالج يقرأ الحالة الحالية من قاعدة البيانات، فإعادة المحاولة آمنة.
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { sceneDurationMs } from "@/lib/domain";
import { now, q } from "@/server/db";
import { env } from "@/server/env";
import { probe } from "@/server/media/probe";
import { render } from "@/server/media/render";
import { ClaudeWriter } from "@/server/providers/claude";
import { ElevenLabsVoice } from "@/server/providers/elevenlabs";
import { ProviderError } from "@/server/providers/types";
import { complete, isCancelled, progress, type JobRow } from "@/server/services/jobs";
import { applyScript, audioFresh, getProjectById, renderIssues, setSceneAudio } from "@/server/services/projects";
import { getRender } from "@/server/services/renders";
import { channelToken, type UploadRow } from "@/server/services/youtube";
import { abs, ensureDir, size } from "@/server/storage";
import { startSession, uploadFile, type VideoMeta } from "@/server/youtube/upload";

async function script(job: JobRow) {
  const e = env();
  if (!e.ANTHROPIC_API_KEY) throw new ProviderError("no key", false, "المخرج الذكي غير متصل (ANTHROPIC_API_KEY).");
  const p = getProjectById(job.project_id);
  progress(job.id, null, "المخرج الذكي يكتب الدرس…");
  const out = await new ClaudeWriter(e.ANTHROPIC_API_KEY, e.ANTHROPIC_MODEL).write(p.subject, p.age);
  if (isCancelled(job.id)) return;
  applyScript(p.id, out);
  complete(job.id, { scenes: out.scenes.length }, `كُتب الدرس: ${out.scenes.length} مشاهد`);
}

async function speech(job: JobRow) {
  const e = env();
  if (!e.ELEVENLABS_API_KEY || !e.ELEVENLABS_VOICE_ID) throw new ProviderError("no key", false, "خدمة الصوت غير متصلة (ELEVENLABS_API_KEY وELEVENLABS_VOICE_ID).");
  const voice = new ElevenLabsVoice(e.ELEVENLABS_API_KEY, e.ELEVENLABS_MODEL, e.ELEVENLABS_VOICE_ID);
  const p = getProjectById(job.project_id);
  // فقط المشاهد التي ينقصها صوت مطابق للنص الحالي
  const todo = p.scenes.filter((s) => s.narration.trim() && !audioFresh(s));
  for (const [k, s] of todo.entries()) {
    if (isCancelled(job.id)) return;
    progress(job.id, k / Math.max(1, todo.length), `توليد صوت المشهد ${s.position + 1}…`);
    const audio = await voice.synthesize(s.narration);
    const rel = `projects/${p.id}/audio/${s.id}-${randomUUID().slice(0, 8)}.mp3`;
    await writeFile(await ensureDir(rel), audio);
    const info = await probe(abs(rel));
    if (!info.hasAudio || !info.durationMs) throw new ProviderError("bad audio", true, "ملف الصوت الناتج تالف. ستُعاد المحاولة.");
    setSceneAudio(p.id, s.id, { file: rel, durationMs: info.durationMs, source: "ai", text: s.narration });
  }
  complete(job.id, { generated: todo.length }, todo.length ? `وُلّد صوت ${todo.length} مشاهد` : "كل المشاهد لها صوت مطابق");
}

async function renderJob(job: JobRow) {
  const p = getProjectById(job.project_id);
  const issues = renderIssues(p);
  if (issues.length) throw new ProviderError("issues", false, issues.join(" "));
  const useVoice = p.voiceMode !== "none";
  const id = randomUUID();
  const file = `projects/${p.id}/renders/${id}.mp4`, thumb = `projects/${p.id}/renders/${id}.jpg`;
  await ensureDir(file);
  const res = await render(
    {
      width: 1080, height: 1920, fps: 30, music: p.music, captions: true,
      scenes: p.scenes.map((s) => {
        const audio = useVoice && s.narration.trim() ? s.audio : null;
        return { durationMs: sceneDurationMs({ ...s, audio }), bg: s.bg, emoji: s.emoji, text: s.text, narration: s.narration, voice: audio ? abs(audio.file) : null, voiceMs: audio?.durationMs ?? null };
      }),
    },
    abs(file),
    abs(thumb),
    (f, m) => progress(job.id, f, m),
  );
  if (isCancelled(job.id)) return;
  q.run("INSERT INTO renders (id, project_id, file, thumb, duration_ms, size_bytes, project_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, p.id, file, thumb, res.durationMs, await size(file), p.version, now());
  complete(job.id, { renderId: id }, "جاهز للمشاهدة والنشر");
}

async function upload(job: JobRow) {
  const payload = JSON.parse(job.payload) as { uploadId: string; renderId: string; meta: VideoMeta };
  const up = q.get<UploadRow>("SELECT * FROM uploads WHERE id = ?", payload.uploadId);
  if (!up) throw new ProviderError("no upload", false, "سجل الرفع غير موجود.");
  if (up.video_id) return complete(job.id, { videoId: up.video_id }, "نُشر على يوتيوب");
  const r = getRender(job.project_id, payload.renderId);
  if (!r) throw new ProviderError("no render", false, "الفيديو المصدَّر غير موجود. صدّره من جديد.");
  progress(job.id, 0, "الاتصال بيوتيوب…");
  const token = await channelToken(job.user_id);
  if (!token) throw new ProviderError("no channel", false, "لا توجد قناة يوتيوب مربوطة. اربط قناتك من الإعدادات.");
  let session = up.session_url;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!session) {
      session = await startSession(token, abs(r.file), payload.meta);
      q.run("UPDATE uploads SET session_url = ?, status = 'uploading' WHERE id = ?", session, up.id);
    }
    const out = await uploadFile(token, session, abs(r.file), (f) => progress(job.id, f, `رفع إلى يوتيوب ${Math.round(f * 100)}٪`), () => isCancelled(job.id));
    if (out !== "expired") {
      q.run("UPDATE uploads SET video_id = ?, status = 'uploaded', session_url = NULL WHERE id = ?", out, up.id);
      return complete(job.id, { videoId: out, url: `https://youtube.com/shorts/${out}` }, "نُشر على يوتيوب");
    }
    // انتهت صلاحية جلسة الرفع (بعد أسبوع تقريبًا): نبدأ جلسة جديدة مرة واحدة
    session = null;
  }
  throw new ProviderError("session expired", true, "انتهت جلسة الرفع. ستُعاد المحاولة.");
}

export const HANDLERS: Record<string, (job: JobRow) => Promise<void>> = { script, speech, render: renderJob, upload };

