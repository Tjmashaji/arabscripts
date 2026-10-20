import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSession, isStaff } from "@/lib/auth";
import { env } from "@/lib/env";
import { signOut } from "@/server/auth-actions";
import type { Locale } from "@/i18n/locales";
import { LanguageSwitcher } from "./language-switcher";

export async function SiteHeader({ locale, path }: { locale: Locale; path: string }) {
  const t = await getTranslations("nav");
  const brand = env.platformName ?? (await getTranslations("brand"))("name");
  const session = await getSession();

  return (
    <header className="bg-ink text-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-ink">
        {t("skip")}
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          {brand}
        </Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          <LanguageSwitcher current={locale} path={path} label={t("language")} />
          <Link href="/products" className="rounded-md px-3 py-2 hover:bg-white/10">
            {t("products")}
          </Link>
          {session ? (
            <>
              {isStaff(session) && (
                <Link href="/admin" className="rounded-md px-3 py-2 hover:bg-white/10">
                  {t("admin")}
                </Link>
              )}
              {session.organizations.length > 0 && (
                <Link href="/partner" className="rounded-md px-3 py-2 hover:bg-white/10">
                  {t("partner")}
                </Link>
              )}
              <Link href="/account" className="rounded-md px-3 py-2 hover:bg-white/10">
                {t("account")}
              </Link>
              <form action={signOut}>
                <input type="hidden" name="locale" value={locale} />
                <button type="submit" className="rounded-md px-3 py-2 hover:bg-white/10">
                  {t("logout")}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="rounded-md px-3 py-2 hover:bg-white/10">
                {t("login")}
              </Link>
              <Link href="/signup" className="rounded-md bg-accent px-3 py-2 font-bold hover:bg-accent-strong">
                {t("signup")}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
