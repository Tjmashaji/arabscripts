import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/server/crypto";
import { buildAss, clean, splitCaption } from "@/server/media/ass";
import { repairScript } from "@/server/providers/claude";

describe("crypto", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("1//refresh-token"), b = encrypt("1//refresh-token");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("1//refresh-token");
    expect(() => decrypt(a.slice(0, -4) + "AAAA")).toThrow();
  });
});

describe("ass", () => {
  it("strips override tags from user text", () => {
    expect(clean("{\\pos(0,0)}مرحبا\\N")).toBe("pos(0,0)مرحباN");
    const ass = buildAss(1080, 1920, [{ startMs: 0, endMs: 1000, text: "{\\b0}ب", style: "Hero", size: 600 }]);
    expect(ass).toContain("}b0ب");
  });
  it("splits captions across the audio duration", () => {
    const l = splitCaption("واحد اثنان ثلاثة أربعة خمسة ستة سبعة", 1000, 7000, 6);
    expect(l).toHaveLength(2);
    expect(l[1].endMs).toBe(8000);
  });
});

describe("repairScript", () => {
  it("keeps only library emoji, trims lengths and enforces #Shorts", () => {
    const out = repairScript(
      {
        title: "الماء",
        scenes: [
          { narration: "هيا نتعلم عن الماء! <b>", on_screen_text: "الماء", emoji: ["💧", "🦄", "💧"] },
          { narration: "x".repeat(400), on_screen_text: "", emoji: [] },
          { narration: "", on_screen_text: "", emoji: ["⭐"] },
        ],
        youtube_title: "لماذا نشرب الماء؟",
        youtube_description: "درس",
        tags: ["ماء"],
      },
      "3-5",
    );
    expect(out.scenes).toHaveLength(2);
    expect(out.scenes[0].emoji).toEqual(["💧"]);
    expect(out.scenes[0].narration).not.toContain("<");
    expect(out.scenes[1].narration.length).toBe(220);
    expect(out.youtube.title).toBe("لماذا نشرب الماء؟ #Shorts");
  });
  it("fails retryably when too few scenes survive", () => {
    expect(() => repairScript({ title: "", scenes: [], youtube_title: "", youtube_description: "", tags: [] }, "6-8")).toThrow();
  });
});
