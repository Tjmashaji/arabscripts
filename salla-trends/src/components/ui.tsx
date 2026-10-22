// مكونات العرض المشتركة (تعمل في الخادم). المكونات التفاعلية في forms.tsx.
import Link from "next/link";
import type { ReactNode } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

const BTN = {
  primary: "bg-brand text-brand-ink hover:brightness-110",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:brightness-95",
  ghost: "text-ink-2 hover:bg-surface-2",
} as const;
export type ButtonVariant = keyof typeof BTN;
export const buttonCls = (v: ButtonVariant = "primary", extra?: string) =>
  cx("inline-flex items-center justify-center gap-2 rounded-xl px-4 h-11 text-[15px] font-bold transition whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed", BTN[v], extra);

export function LinkButton({ href, variant = "primary", className, children }: { href: string; variant?: ButtonVariant; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonCls(variant, className)}>
      {children}
    </Link>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("rounded-2xl border border-line bg-surface p-5 sm:p-6", className)}>{children}</section>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl text-ink">{title}</h1>
        {subtitle ? <p className="mt-1 text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold num">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

const BADGE = {
  neutral: "bg-surface-2 text-ink-2",
  brand: "bg-brand-soft text-brand",
  hot: "bg-hot-soft text-hot",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE; children: ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap", BADGE[tone])}>{children}</span>;
}

export function Notice({ tone = "brand", title, children }: { tone?: "brand" | "warn" | "danger" | "ok"; title?: string; children: ReactNode }) {
  const t = { brand: "border-brand/20 bg-brand-soft", warn: "border-warn/20 bg-warn-soft", danger: "border-danger/20 bg-danger-soft", ok: "border-ok/20 bg-ok-soft" }[tone];
  return (
    <div className={cx("rounded-2xl border p-4 text-[15px]", t)} role={tone === "danger" ? "alert" : undefined}>
      {title ? <div className="font-bold mb-1">{title}</div> : null}
      <div className="text-ink-2">{children}</div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
      <div className="font-bold">{title}</div>
      {children ? <div className="mt-1 text-ink-2 text-[15px]">{children}</div> : null}
    </div>
  );
}

export function VerifiedMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cx("size-4", className)}>
      <path fill="currentColor" d="M12 1.5l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z" />
      <path fill="#fff" d="M10.6 15.6l-3.2-3.2 1.4-1.4 1.8 1.8 4.6-4.6 1.4 1.4z" />
    </svg>
  );
}
