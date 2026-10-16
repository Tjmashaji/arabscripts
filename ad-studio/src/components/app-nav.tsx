"use client";
import { FlaskConical, LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { Logo } from "./logo";
import { cx } from "./ui";

const LINKS = [
  { href: "/projects", label: "المشاريع" },
  { href: "/templates", label: "القوالب والأفكار" },
  { href: "/studio", label: "الشخصيات والأصوات" },
  { href: "/jobs", label: "المهام والتكلفة" },
  { href: "/settings", label: "الإعدادات" },
];

export function AppNav({ user, simulated }: { user: { name: string; email: string; isAdmin: boolean }; simulated: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const links = user.isAdmin ? [...LINKS, { href: "/admin", label: "إدارة النظام" }] : LINKS;
  async function logout() {
    await api("/api/auth/logout", { body: {} });
    router.replace("/login");
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 sm:px-6 h-16">
        <Link href="/projects" aria-label="الرئيسية"><Logo size={30} /></Link>
        <nav className="hidden md:flex items-center gap-1 ms-4" aria-label="التنقل الرئيسي">
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined} className={cx("rounded-lg px-3 h-9 inline-flex items-center text-sm font-bold transition", path.startsWith(l.href) ? "bg-ink text-white" : "text-ink-2 hover:bg-surface-2")}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          {simulated ? (
            <Link href="/settings#providers" className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-3 h-8 text-xs font-bold text-amber" title="بعض خدمات الذكاء الاصطناعي تعمل في وضع المحاكاة">
              <FlaskConical className="size-3.5" aria-hidden /> وضع المحاكاة
            </Link>
          ) : null}
          <span className="hidden lg:block text-sm text-ink-2">{user.name}</span>
          <button onClick={logout} className="hidden md:inline-flex rounded-lg p-2 hover:bg-surface-2" aria-label="تسجيل الخروج" title="تسجيل الخروج">
            <LogOut className="size-5" />
          </button>
          <button onClick={() => setOpen((o) => !o)} className="md:hidden rounded-lg p-2 hover:bg-surface-2" aria-label="القائمة" aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open ? (
        <nav className="md:hidden border-t border-line px-4 py-3 flex flex-col gap-1 bg-paper" aria-label="التنقل الرئيسي">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={cx("rounded-lg px-3 py-2 font-bold", path.startsWith(l.href) ? "bg-ink text-white" : "hover:bg-surface-2")}>
              {l.label}
            </Link>
          ))}
          <button onClick={logout} className="rounded-lg px-3 py-2 text-start font-bold text-danger hover:bg-danger-soft">تسجيل الخروج</button>
        </nav>
      ) : null}
    </header>
  );
}
