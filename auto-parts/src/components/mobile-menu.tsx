"use client";

import { useState, type ReactNode } from "react";

// روابط الهيدر: سطر واحد على الشاشات الكبيرة، وعلى الجوال تنفتح من زر القائمة (نفس الروابط، لا نسخة ثانية).
export function MobileMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpen((v) => !v)}
        className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-white/10 lg:hidden"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
        </svg>
      </button>
      <nav
        id="site-menu"
        aria-label={label}
        className={
          (open ? "flex " : "hidden ") +
          "absolute inset-x-0 top-full z-30 flex-col gap-1 border-t border-white/10 bg-ink px-4 pb-4 pt-2 text-base shadow-lg " +
          "lg:static lg:flex lg:flex-row lg:flex-wrap lg:items-center lg:gap-2 lg:border-0 lg:bg-transparent lg:p-0 lg:text-sm lg:shadow-none"
        }
      >
        {children}
      </nav>
    </>
  );
}
