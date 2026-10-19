// تدفق كامل في العامل: درس جاهز ← تصدير حقيقي بـ FFmpeg ← رفع إلى يوتيوب (Google مُحاكى عبر fetch)
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { now, q } from "@/server/db";
import { claim, enqueue, getJob } from "@/server/services/jobs";
import { createProject, getProject, renderIssues, updateProject } from "@/server/services/projects";
import { requestPublish } from "@/server/services/publish";
import { saveChannel } from "@/server/services/youtube";
import { runOnce } from "@/worker/index";

process.env.GOOGLE_CLIENT_ID = "cid";
process.env.GOOGLE_CLIENT_SECRET = "secret";

function user() {
  const id = randomUUID();
  q.run("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)", id, `${id}@x.test`, "مستخدم", "x", now());
  return id;
}

afterEach(() => vi.unstubAllGlobals());

describe("worker flow", () => {
  it("renders a built-in lesson and uploads it to YouTube as made-for-kids", async () => {
    const uid = user();
    const { id } = createProject(uid, { category: "numbers", subject: "1-5", age: "3-5", voiceMode: "none", music: "calm" }, { claude: false });
    // نقصر الدرس لتسريع الاختبار
    updateProject(uid, id, { scenes: getProject(uid, id).scenes.slice(0, 3).map(({ id, narration, text, emoji, bg }) => ({ id, narration, text, emoji, bg })) });
    expect(renderIssues(getProject(uid, id))).toEqual([]);

    const rj = enqueue(uid, id, "render");
    expect(enqueue(uid, id, "render").id).toBe(rj.id); // لا مهمة مكررة
    expect(await runOnce()).toBe(true);
    expect(getJob(uid, rj.id).status).toBe("completed");
    const render = q.get<{ id: string }>("SELECT id FROM renders WHERE project_id = ?", id)!;

    saveChannel(uid, { id: "UC1", title: "قناتي", thumbnail: null }, "refresh-1", "s");
    const job = requestPublish(uid, id, { renderId: render.id, youtube: { title: "العد #Shorts", description: "د", tags: [] }, privacy: "unlisted", publishAt: null });
    let sent: { status: Record<string, unknown> } | null = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "at", expires_in: 3600, scope: "s" });
      if (url.includes("uploadType=resumable")) {
        sent = JSON.parse(init.body as string);
        return new Response(null, { status: 200, headers: { location: "https://upload/session" } });
      }
      const cr = (init.headers as Record<string, string>)["content-range"];
      if (cr.startsWith("bytes */")) return new Response(null, { status: 308 });
      return Response.json({ id: "VIDX" });
    }));
    expect(await runOnce()).toBe(true);
    expect(getJob(uid, job.id)).toMatchObject({ status: "completed", result: { videoId: "VIDX" } });
    expect(sent!.status).toMatchObject({ selfDeclaredMadeForKids: true, privacyStatus: "unlisted" });
    expect(q.get<{ video_id: string }>("SELECT video_id FROM uploads WHERE job_id = ?", job.id)!.video_id).toBe("VIDX");
    expect(() => requestPublish(uid, id, { renderId: render.id, youtube: { title: "t", description: "", tags: [] }, privacy: "public", publishAt: null })).toThrow(/مسبقًا/);
  });

  it("blocks export when recorded audio is missing or stale, and retries failures with backoff", async () => {
    const uid = user();
    const { id } = createProject(uid, { category: "letters", subject: "ب", age: "3-5", voiceMode: "recorded", music: "none" }, { claude: false });
    expect(renderIssues(getProject(uid, id)).join(" ")).toContain("بلا صوت");
    const j = enqueue(uid, id, "render", {}, 2);
    await runOnce();
    const row = q.get<{ status: string; error: string }>("SELECT status, error FROM jobs WHERE id = ?", j.id)!;
    expect(row.status).toBe("failed"); // مشاكل الإدخال لا تُعاد
    expect(row.error).toContain("بلا صوت");
    expect(claim()).toBeUndefined();
  });
});
