import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/server/actions";
import { buttonCls, cx } from "./ui";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-display text-lg text-ink">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--brand)" />
        <path d="M7 22l6-6 4 4 8-9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="25" cy="11" r="2.6" fill="var(--hot)" />
      </svg>
      رادار الترند
    </Link>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line py-6 text-sm text-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 sm:flex-row sm:justify-between">
        <span>منصة مستقلة تعمل كتطبيق في متجر تطبيقات سلة، وليست تابعة لشركة سلة.</span>
        <nav className="flex gap-4">
          <Link href="/privacy" className="hover:text-ink">الخصوصية والبيانات</Link>
          <Link href="/login" className="hover:text-ink">دخول التجار</Link>
        </nav>
      </div>
    </footer>
  );
}

export function AppShell({ nav, who, children }: { nav: { href: string; label: string }[]; who: ReactNode; children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Logo />
          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="القائمة">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className={cx("rounded-lg px-3 py-1.5 text-[15px] text-ink-2 hover:bg-surface-2 whitespace-nowrap")}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-3 text-sm">
            <span className="text-ink-2 max-w-40 truncate">{who}</span>
            <form action={logout}>
              <button className={buttonCls("ghost", "h-9 px-3 text-sm")}>خروج</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <Footer />
    </>
  );
}
