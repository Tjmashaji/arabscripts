import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/server/providers/types";
import { CHUNK, startSession, uploadFile, videoResource, type VideoMeta } from "@/server/youtube/upload";
import { authUrl } from "@/server/youtube/oauth";

const meta: VideoMeta = { title: "حرف الباء #Shorts", description: "درس", tags: ["أطفال"], privacy: "public", publishAt: null, syntheticMedia: false };

function file(bytes: number) {
  const f = path.join(mkdtempSync(path.join(os.tmpdir(), "yt-")), "v.mp4");
  writeFileSync(f, Buffer.alloc(bytes, 7));
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe("youtube", () => {
  it("always declares the video as made for kids, and keeps scheduled videos private", () => {
    expect(videoResource(meta).status).toMatchObject({ selfDeclaredMadeForKids: true, privacyStatus: "public" });
    const s = videoResource({ ...meta, publishAt: "2030-01-01T10:00:00.000Z" }).status;
    expect(s).toMatchObject({ privacyStatus: "private", publishAt: "2030-01-01T10:00:00.000Z" });
    expect(videoResource(meta).snippet.categoryId).toBe("27");
  });

  it("builds an offline consent URL with upload scope and state", () => {
    const u = new URL(authUrl({ clientId: "cid", clientSecret: "s", redirectUri: "http://x/cb" }, "st"));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("scope")).toContain("youtube.upload");
    expect(u.searchParams.get("state")).toBe("st");
  });

  it("starts a resumable session with metadata and size headers", async () => {
    const f = file(1000);
    const fetchMock = vi.fn(async () => new Response(null, { status: 200, headers: { location: "https://upload/session1" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await startSession("tok", f, meta)).toBe("https://upload/session1");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const h = init.headers as Record<string, string>;
    expect(h["x-upload-content-length"]).toBe("1000");
    expect(JSON.parse(init.body as string).status.selfDeclaredMadeForKids).toBe(true);
  });

  it("uploads in chunks and resumes from the server's offset", async () => {
    const size = CHUNK + 5000;
    const f = file(size);
    const ranges: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const cr = (init.headers as Record<string, string>)["content-range"];
      ranges.push(cr);
      // استعلام الحالة: الخادم استلم أول 1000 بايت من جلسة سابقة
      if (cr === `bytes */${size}`) return new Response(null, { status: 308, headers: { range: "bytes=0-999" } });
      const end = Number(cr.split("-")[1].split("/")[0]);
      if (end < size - 1) return new Response(null, { status: 308, headers: { range: `bytes=0-${end}` } });
      return Response.json({ id: "VID123" });
    }));
    const progress: number[] = [];
    expect(await uploadFile("tok", "https://upload/s", f, (p) => progress.push(p), () => false)).toBe("VID123");
    expect(ranges[1]).toBe(`bytes 1000-${1000 + CHUNK - 1}/${size}`);
    expect(ranges[2]).toBe(`bytes ${1000 + CHUNK}-${size - 1}/${size}`);
    expect(progress[0]).toBeCloseTo((1000 + CHUNK) / size);
  });

  it("reports an expired session and maps quota errors as retryable", async () => {
    const f = file(10);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(await uploadFile("tok", "https://upload/s", f, () => {}, () => false)).toBe("expired");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { errors: [{ reason: "quotaExceeded" }] } }, { status: 403 })));
    const err = await startSession("tok", f, meta).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.retryable).toBe(true);
  });
});
