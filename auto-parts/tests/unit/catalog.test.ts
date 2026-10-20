import { describe, expect, it } from "vitest";
import { isPartType, localName, parsePartNumbers, sniffImage } from "@/lib/catalog";

describe("parsePartNumbers", () => {
  it("splits lines and commas, trims, dedupes, and keeps the original spelling", () => {
    expect(parsePartNumbers(" ABC-123 \n abc-123\nX\n  MF/999 , 0001-AB ")).toEqual(["ABC-123", "abc-123", "MF/999", "0001-AB"]);
  });
  it("caps the list at 20", () => {
    expect(parsePartNumbers(Array.from({ length: 30 }, (_, i) => `P${i}0`).join("\n"))).toHaveLength(20);
  });
});

describe("sniffImage", () => {
  const pad = (b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  it("recognizes JPEG, PNG and WEBP by content", () => {
    expect(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0]))?.ext).toBe("jpg");
    expect(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.ext).toBe("png");
    expect(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))?.ext).toBe("webp");
  });
  it("rejects SVG and PDF (not allowed as product images)", () => {
    expect(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>"))).toBeNull();
    expect(sniffImage(pad([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBeNull();
  });
});

describe("helpers", () => {
  it("picks the localized name", () => {
    const row = { name_ar: "شيري", name_en: "Chery", name_zh: "奇瑞" };
    expect([localName(row, "ar"), localName(row, "en"), localName(row, "zh")]).toEqual(["شيري", "Chery", "奇瑞"]);
  });
  it("validates part types", () => {
    expect(isPartType("used")).toBe(true);
    expect(isPartType("new")).toBe(false);
  });
});
