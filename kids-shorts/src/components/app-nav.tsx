"use client";
import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { Logo } from "./logo";
import { cx } from "./ui";

const LINKS = [
  { href: "/dashboard", label: "مقاطعي" },
  { href: "/settings", label: "القناة والإعدادات" },
];

export function AppNav({ user }: { user: { name: string } }) {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await api("/api/auth/logout", { body: {} });
    router.replace("/login");
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 sm:px-6 h-16">
        <Link href="/dashboard" aria-label="الرئيسية"><span className="sm:hidden"><Logo size={30} withText={false} /></span><span className="hidden sm:inline"><Logo size={30} /></span></Link>
        <nav className="flex items-center gap-1 ms-2 sm:ms-4" aria-label="التنقل الرئيسي">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined} className={cx("rounded-lg px-2.5 sm:px-3 h-9 inline-flex items-center text-sm font-bold whitespace-nowrap transition", path.startsWith(l.href) ? "bg-ink text-white" : "text-ink-2 hover:bg-surface-2")}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          <Link href="/new" className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 h-10 text-sm font-bold text-white">
            <Plus className="size-4" aria-hidden /> مقطع جديد
          </Link>
          <span className="hidden lg:block text-sm text-ink-2">{user.name}</span>
          <button onClick={logout} className="rounded-lg p-2 hover:bg-surface-2" aria-label="تسجيل الخروج" title="تسجيل الخروج">
            <LogOut className="size-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
