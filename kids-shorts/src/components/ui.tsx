"use client";
// نظام التصميم: مكونات صغيرة قابلة لإعادة الاستخدام بنفس المسافات والألوان والحالات في كل الصفحات.
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:brightness-95 shadow-[0_6px_20px_-8px_rgba(108,76,241,.7)]",
  secondary: "bg-surface text-ink border border-line hover:bg-surface-2",
  ghost: "text-ink-2 hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:brightness-95",
};

export function Button({ variant = "primary", loading, icon, className, children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx("inline-flex items-center justify-center gap-2 rounded-xl px-4 h-11 text-[15px] font-bold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap", VARIANT[variant], className)}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = "primary", className, children, icon }: { href: string; variant?: Variant; className?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <Link href={href} className={cx("inline-flex items-center justify-center gap-2 rounded-xl px-4 h-11 text-[15px] font-bold transition whitespace-nowrap", VARIANT[variant], className)}>
      {icon}
      {children}
    </Link>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-bold text-ink">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-ink-2 outline-none transition";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, "h-11", props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, "min-h-24 leading-7", props.className)} />;
}
export function Select({ options, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...props} className={cx(inputCls, "h-11 appearance-none bg-[length:12px] pe-3", props.className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// مجموعة خيارات كبطاقات (أسهل لغير المتخصصين من القوائم المنسدلة)
export function ChoiceGroup<T extends string>({ label, value, onChange, options, columns = 3 }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[]; columns?: number }) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-bold mb-2">{label}</legend>
      <div role="radiogroup" aria-labelledby={id} className={cx("grid gap-2", columns === 2 ? "grid-cols-1 sm:grid-cols-2" : columns === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3")}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              type="button"
              role="radio"
              aria-checked={on}
              key={o.value}
              onClick={() => onChange(o.value)}
              className={cx("rounded-xl border px-3 py-2.5 text-start text-sm transition", on ? "border-ink bg-ink text-white" : "border-line bg-surface hover:border-ink-2")}
            >
              <span className="font-bold">{o.label}</span>
              {o.hint ? <span className={cx("block text-xs mt-0.5", on ? "text-white/70" : "text-muted")}>{o.hint}</span> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Card({ children, className, as: As = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <As className={cx("rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6", className)}>{children}</As>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
      <div>
        {eyebrow ? <p className="text-xs font-bold text-accent mb-1">{eyebrow}</p> : null}
        <h1 className="font-display text-2xl sm:text-3xl leading-snug">{title}</h1>
        {subtitle ? <p className="text-ink-2 mt-1 max-w-2xl">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

type Tone = "neutral" | "ok" | "warn" | "danger" | "info" | "accent";
const TONE: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2",
  ok: "bg-ok-soft text-ok",
  warn: "bg-amber-soft text-amber",
  danger: "bg-danger-soft text-danger",
  info: "bg-teal-soft text-teal",
  accent: "bg-accent-soft text-accent",
};
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", TONE[tone], className)}>{children}</span>;
}

export function Notice({ tone = "info", title, children, action }: { tone?: "info" | "warn" | "danger" | "ok"; title?: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("flex gap-3 rounded-2xl p-4 text-sm", tone === "info" ? "bg-teal-soft" : tone === "warn" ? "bg-amber-soft" : tone === "ok" ? "bg-ok-soft" : "bg-danger-soft")}>
      <Icon className={cx("size-5 shrink-0 mt-0.5", tone === "info" ? "text-teal" : tone === "warn" ? "text-amber" : tone === "ok" ? "text-ok" : "text-danger")} aria-hidden />
      <div className="flex-1">
        {title ? <p className="font-bold">{title}</p> : null}
        {children ? <div className="text-ink-2">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line bg-surface px-6 py-12">
      <div className="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</div>
      <h2 className="font-display text-lg">{title}</h2>
      {children ? <div className="text-ink-2 max-w-md text-sm">{children}</div> : null}
      {action}
    </div>
  );
}

// شريط تقدم: بلا نسبة يعرض حركة غير محددة بدل رقم غير موثوق
export function Progress({ value, label }: { value: number | null; label?: string }) {
  return (
    <div className="w-full">
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} aria-label={label}>
        {value === null ? <div className="h-full w-1/3 rounded-full bg-accent/70 animate-[indeterminate_1.4s_ease-in-out_infinite]" /> : <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(2, value)}%` }} />}
      </div>
      {label ? <p className="text-xs text-muted mt-1">{label}</p> : null}
      <style>{`@keyframes indeterminate{0%{transform:translateX(150%)}100%{transform:translateX(-250%)}}`}</style>
    </div>
  );
}

export function Spinner({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-muted text-sm py-8 justify-center">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className={cx("m-auto rounded-[var(--radius-card)] bg-surface p-0 text-ink backdrop:bg-ink/40 w-[min(92vw,640px)]", wide && "w-[min(94vw,960px)]")} dir="rtl">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="font-display text-lg">{title}</h2>
        <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-surface-2" aria-label="إغلاق">
          <X className="size-5" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
    </dialog>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[] }) {
  return (
    <div role="tablist" className="inline-flex rounded-xl bg-surface-2 p-1 gap-1">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)} className={cx("rounded-lg px-3 h-9 text-sm font-bold transition", value === t.value ? "bg-surface shadow-sm" : "text-ink-2 hover:text-ink")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer select-none text-sm">
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cx("relative h-6 w-11 rounded-full transition", checked ? "bg-ink" : "bg-line")}>
        <span className={cx("absolute top-0.5 size-5 rounded-full bg-white transition-all", checked ? "start-[22px]" : "start-0.5")} />
      </button>
      {label}
    </label>
  );
}
