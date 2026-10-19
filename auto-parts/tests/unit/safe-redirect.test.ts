import { describe, expect, it } from "vitest";
import { safeNextPath, stripLocalePrefix } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it("keeps internal paths", () => {
    expect(safeNextPath("/account")).toBe("/account");
    expect(safeNextPath("/admin/access?x=1")).toBe("/admin/access?x=1");
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, 42, "/a\nb"])(
    "rejects %s",
    (value) => {
      expect(safeNextPath(value)).toBe("/account");
    },
  );
});

describe("stripLocalePrefix", () => {
  const locales = ["ar", "en", "zh"];
  it("removes a known locale prefix", () => {
    expect(stripLocalePrefix("/en/account", locales)).toBe("/account");
    expect(stripLocalePrefix("/zh", locales)).toBe("/");
  });
  it("leaves other paths alone", () => {
    expect(stripLocalePrefix("/account", locales)).toBe("/account");
    expect(stripLocalePrefix("/english", locales)).toBe("/english");
  });
});
