// تسجيل صوتي من المتصفح (أو ملف صوتي) لمشهد واحد. يُحوَّل إلى m4a موحد ويُقاس طوله فعليًا.
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "@/server/env";
import { errors } from "@/server/http/errors";
import { handler, rateLimit } from "@/server/http/route";
import { ffmpeg } from "@/server/media/ffmpeg";
import { probe } from "@/server/media/probe";
import { projectPayload } from "@/server/services/payload";
import { clearSceneAudio, getProject, setSceneAudio } from "@/server/services/projects";
import { abs, ensureDir } from "@/server/storage";

type P = { id: string; sceneId: string };

export const POST = handler<P>(async ({ req, user, params }) => {
  rateLimit(`audio:${user.id}`, 120, 3600);
  const p = getProject(user.id, params.id);
  const scene = p.scenes.find((s) => s.id === params.sceneId);
  if (!scene) throw errors.notFound("المشهد");
  const max = env().MAX_AUDIO_MB * 1024 * 1024;
  if (Number(req.headers.get("content-length") ?? 0) > max) throw errors.invalid(`حجم الملف الصوتي أكبر من ${env().MAX_AUDIO_MB} ميجابايت.`);
  const data = Buffer.from(await req.arrayBuffer());
  if (!data.length || data.length > max) throw errors.invalid("الملف الصوتي فارغ أو كبير جدًا.");
  const tmp = path.join(os.tmpdir(), `upload-${randomUUID()}`);
  await writeFile(tmp, data);
  try {
    let info;
    try {
      info = await probe(tmp);
    } catch {
      throw errors.invalid("تعذّر قراءة الملف الصوتي. سجّل مجددًا أو استخدم ملفًا بصيغة mp3 أو m4a أو wav.");
    }
    if (!info.hasAudio) throw errors.invalid("الملف لا يحتوي على صوت.");
    const rel = `projects/${p.id}/audio/${scene.id}-${randomUUID().slice(0, 8)}.m4a`;
    // قص الصمت من البداية والنهاية، وتوحيد الصيغة لتعمل في المتصفح وFFmpeg
    await ffmpeg(["-i", tmp, "-vn", "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", await ensureDir(rel)], { timeoutMs: 120_000 });
    const out = await probe(abs(rel));
    if (!out.durationMs || out.durationMs < 300) throw errors.invalid("التسجيل قصير جدًا أو صامت.");
    if (out.durationMs > 11_000) throw errors.invalid("التسجيل أطول من 11 ثانية. اجعل جملة المشهد أقصر.");
    setSceneAudio(p.id, scene.id, { file: rel, durationMs: out.durationMs, source: "recorded", text: scene.narration });
  } finally {
    await rm(tmp, { force: true });
  }
  return projectPayload(user.id, params.id);
});

export const DELETE = handler<P>(async ({ user, params }) => {
  clearSceneAudio(user.id, params.id, params.sceneId);
  return projectPayload(user.id, params.id);
});
