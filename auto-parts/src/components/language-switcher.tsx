import { switchLocale } from "@/server/auth-actions";
import { localeNames, localeShortNames, locales, type Locale } from "@/i18n/locales";
import { cx } from "./ui";

// نموذج عادي لكل لغة (يعمل بدون JavaScript)، ويحفظ الاختيار في الحساب عند تسجيل الدخول.
export function LanguageSwitcher({ current, path, label }: { current: Locale; path: string; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      {locales.map((locale) => (
        <form key={locale} action={switchLocale}>
          <input type="hidden" name="target" value={locale} />
          <input type="hidden" name="path" value={path} />
          <button
            type="submit"
            lang={locale}
            title={localeNames[locale]}
            aria-label={localeNames[locale]}
            aria-current={locale === current ? "true" : undefined}
            className={cx(
              "min-h-9 min-w-9 rounded-md px-2 text-xs font-bold",
              locale === current ? "bg-white text-ink" : "text-white/80 hover:bg-white/10",
            )}
          >
            {localeShortNames[locale]}
          </button>
        </form>
      ))}
    </div>
  );
}
