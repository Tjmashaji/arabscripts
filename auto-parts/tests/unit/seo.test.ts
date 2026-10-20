import { describe, expect, it } from "vitest";
import { alternates, jsonLd, localizedPath } from "@/lib/seo";

describe("seo helpers", () => {
  it("builds localized paths with Arabic unprefixed", () => {
    expect(localizedPath("ar", "/faq")).toBe("/faq");
    expect(localizedPath("en", "/faq")).toBe("/en/faq");
    expect(localizedPath("zh", "/")).toBe("/zh");
  });
  it("lists every language plus x-default", () => {
    expect(alternates("en", "/products")).toEqual({
      canonical: "/en/products",
      languages: { ar: "/products", en: "/en/products", zh: "/zh/products", "x-default": "/products" },
    });
  });
  it("escapes JSON-LD so it can't close the script tag", () => {
    expect(jsonLd({ name: "</script><b>" })).toBe('{"name":"\\u003c/script\\u003e\\u003cb\\u003e"}');
  });
});
