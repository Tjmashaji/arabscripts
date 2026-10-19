import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@/server/media/render";
import { probe } from "@/server/media/probe";
import { ffmpeg } from "@/server/media/ffmpeg";

describe("render", () => {
  it("produces a vertical short with audio, text and animated emoji", async () => {
    const dir = process.env.KEEP_RENDER ?? mkdtempSync(path.join(os.tmpdir(), "ks-render-"));
    const voice = path.join(dir, "v.wav");
    await ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=1.2", voice]);
    const out = path.join(dir, "out.mp4"), thumb = path.join(dir, "t.jpg");
    const r = await render(
      {
        width: 540, height: 960, fps: 30, music: "happy", captions: true,
        scenes: [
          { durationMs: 2000, bg: "#4FC3F7", emoji: ["🦆"], text: "بطة", narration: "هذه بطة صغيرة", voice, voiceMs: 1200 },
          { durationMs: 2000, bg: "#FFB74D", emoji: [], text: "ب", narration: "حرف الباء", voice: null, voiceMs: null },
          { durationMs: 2500, bg: "#AED581", emoji: ["🍎", "🍎", "🍎", "🍎", "🍎"], text: "٥", narration: "", voice: null, voiceMs: null },
        ],
      },
      out,
      thumb,
    );
    expect(r.width).toBe(540);
    const p = await probe(out);
    expect(p.hasAudio && p.hasVideo).toBe(true);
    expect(Math.abs((p.durationMs ?? 0) - 6500)).toBeLessThan(300);
    expect((await probe(thumb)).width).toBe(540);
  });
});
