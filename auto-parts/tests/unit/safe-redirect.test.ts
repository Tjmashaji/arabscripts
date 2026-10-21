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

describe("internal redirect after removing the locale prefix (open-redirect regression)", () => {
  const locales = ["ar", "en", "zh"];
  const target = (v: string) => stripLocalePrefix(safeNextPath(v), locales);
  it.each(["/en//evil.example", "/ar//evil.example/x", "/zh//evil.example", "/en/\\evil.example", "/en/%2F%2Fevil.example"])(
    "never yields a protocol-relative URL for %s",
    (value) => {
      const out = target(value);
      expect(out.startsWith("//")).toBe(false);
      expect(out.startsWith("/\\")).toBe(false);
      expect(new URL(out, "https://site.test").origin).toBe("https://site.test");
    },
  );
  it("still keeps normal localized paths", () => {
    expect(target("/en/account/orders?x=1")).toBe("/account/orders?x=1");
  });
});
