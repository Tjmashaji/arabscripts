import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { directionOf, isLocale, locales } from "@/i18n/locales";

function keys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k)).sort();
}

function placeholders(obj: unknown, prefix = ""): Record<string, string[]> {
  if (typeof obj === "string") return { [prefix]: (obj.match(/\{\w+\}/g) ?? []).sort() };
  return Object.assign({}, ...Object.entries(obj as object).map(([k, v]) => placeholders(v, prefix ? `${prefix}.${k}` : k)));
}

describe("translations", () => {
  const all = { ar, en, zh };

  it("has a messages file for every enabled locale", () => {
    expect(Object.keys(all).sort()).toEqual([...locales].sort());
  });

  it.each(["en", "zh"] as const)("%s has exactly the same keys as Arabic", (locale) => {
    expect(keys(all[locale])).toEqual(keys(ar));
  });

  it.each(["en", "zh"] as const)("%s keeps the same {placeholders} as Arabic", (locale) => {
    expect(placeholders(all[locale])).toEqual(placeholders(ar));
  });

  it("has no empty strings", () => {
    for (const [locale, messages] of Object.entries(all)) {
      for (const [key, value] of Object.entries(placeholders(messages))) {
        expect(value, `${locale}:${key}`).toBeDefined();
      }
      const flat = JSON.stringify(messages);
      expect(flat.includes('""'), locale).toBe(false);
    }
  });
});

describe("locale helpers", () => {
  it("uses RTL for Arabic and LTR for English and Chinese", () => {
    expect(directionOf("ar")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
    expect(directionOf("zh")).toBe("ltr");
  });

  it("accepts only enabled locales", () => {
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
