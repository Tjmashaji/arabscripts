// اللغات المفعّلة واتجاه كل لغة. لإضافة لغة: أضفها هنا وفي ap_locales وأنشئ ملف messages/<code>.json.
export const locales = ["ar", "en", "zh"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ar";

const rtlLocales: ReadonlySet<string> = new Set(["ar", "fa", "he", "ur"]);

export function directionOf(locale: string): "rtl" | "ltr" {
  return rtlLocales.has(locale) ? "rtl" : "ltr";
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

export const localeNames: Record<Locale, string> = { ar: "العربية", en: "English", zh: "简体中文" };
export const localeShortNames: Record<Locale, string> = { ar: "ع", en: "EN", zh: "中文" };

// Next.js يمرر لغة المسار كنص؛ التخطيط الرئيسي يرفض اللغات غير المفعلة، وهذه تضيّق النوع للصفحات.
export async function localeFrom(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  return isLocale(locale) ? locale : defaultLocale;
}
