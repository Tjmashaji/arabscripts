// طلب النشر على يوتيوب: يتحقق من القناة والفيديو والموعد، ثم ينشئ مهمة رفع وسجلها معًا.
import type { Privacy, YoutubeMeta } from "@/lib/domain";
import { q, tx } from "../db";
import { errors } from "../http/errors";
import { enqueue } from "./jobs";
import { getProject, updateProject } from "./projects";
import { getRender } from "./renders";
import { createUpload, getChannel } from "./youtube";

export function requestPublish(userId: string, projectId: string, b: { renderId: string; youtube: YoutubeMeta; privacy: Privacy; publishAt: string | null }) {
  const p = getProject(userId, projectId);
  if (!getChannel(userId)) throw errors.invalid("اربط قناة يوتيوب أولًا من الإعدادات.");
  const r = getRender(p.id, b.renderId);
  if (!r) throw errors.notFound("الفيديو المصدَّر");
  const publishAt = b.publishAt ? Date.parse(b.publishAt) : null;
  if (publishAt !== null && publishAt < Date.now() + 15 * 60_000) throw errors.invalid("موعد النشر يجب أن يكون بعد 15 دقيقة على الأقل.");
  if (q.get("SELECT 1 FROM uploads WHERE render_id = ? AND status = 'uploaded'", r.id)) throw errors.conflict("نُشر هذا الفيديو على يوتيوب مسبقًا.");
  updateProject(userId, p.id, { youtube: b.youtube });
  return tx(() => {
    const job = enqueue(userId, p.id, "upload", {}, 5);
    // طلب مكرر أثناء رفع جارٍ يعيد المهمة نفسها دون تغيير حمولتها
    if (q.get("SELECT 1 FROM uploads WHERE job_id = ?", job.id)) return job;
    const up = createUpload(p.id, r.id, job.id, b.privacy, publishAt);
    const meta = { ...b.youtube, privacy: b.privacy, publishAt: publishAt ? new Date(publishAt).toISOString() : null, syntheticMedia: p.voiceMode === "ai" };
    q.run("UPDATE jobs SET payload = ? WHERE id = ?", JSON.stringify({ uploadId: up.id, renderId: r.id, meta }), job.id);
    return job;
  });
}
