import { defaultLocale, isLocale, type Locale } from "@/i18n/locales";

export function text(form: FormData, key: string, max = 500): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function formLocale(form: FormData, key = "locale"): Locale {
  const value = form.get(key);
  return isLocale(value) ? value : defaultLocale;
}
