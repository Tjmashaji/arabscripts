import type { Metadata } from "next";
import { defaultLocale, locales, type Locale } from "@/i18n/locales";

// رابط الصفحة بكل لغة: العربية بلا بادئة، والبقية /en و/zh. يُستخدم في hreflang وخريطة الموقع.
export function localizedPath(locale: Locale, path: string): string {
  if (locale === defaultLocale) return path;
  return `/${locale}${path === "/" ? "" : path}`;
}

export function alternates(locale: Locale, path: string): Metadata["alternates"] {
  return {
    canonical: localizedPath(locale, path),
    languages: { ...Object.fromEntries(locales.map((l) => [l, localizedPath(l, path)])), "x-default": localizedPath(defaultLocale, path) },
  };
}

export const ogLocale: Record<Locale, string> = { ar: "ar_SA", en: "en_US", zh: "zh_CN" };

// JSON-LD آمن داخل <script>: يمنع إغلاق الوسم أو حقن HTML من أي نص.
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
