import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_IDS, scenesSchema, youtubeMetaSchema, type Age } from "@/lib/domain";
import { EMOJI_LIST, emojiFile } from "@/lib/emoji";
import { buildLesson, subjectsFor } from "@/lib/lessons";

describe("built-in lessons", () => {
  it("every emoji in the library has a rendered image", () => {
    for (const e of EMOJI_LIST) expect(existsSync(path.resolve("assets/emoji", `${emojiFile(e)}.png`)), e).toBe(true);
  });

  for (const c of CATEGORY_IDS.filter((c) => c !== "custom")) {
    it(`builds a valid lesson for every ${c} subject and age`, () => {
      const subjects = subjectsFor(c);
      expect(subjects.length).toBeGreaterThan(0);
      for (const s of subjects) {
        for (const age of ["3-5", "6-8"] as Age[]) {
          const l = buildLesson(c, s.value, age);
          expect(l, `${c}/${s.value}`).not.toBeNull();
          expect(() => scenesSchema.parse(l!.scenes), `${c}/${s.value}`).not.toThrow();
          expect(() => youtubeMetaSchema.parse(l!.youtube), `${c}/${s.value}`).not.toThrow();
          expect(new Set(l!.scenes.map((x) => x.id)).size).toBe(l!.scenes.length);
          expect(l!.youtube.title).toContain("#Shorts");
        }
      }
    });
  }

  it("rejects unknown subjects", () => {
    expect(buildLesson("letters", "Z", "3-5")).toBeNull();
    expect(buildLesson("numbers", "5-1", "3-5")).toBeNull();
  });
});
