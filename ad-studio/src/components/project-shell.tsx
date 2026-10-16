"use client";
import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProjectProvider, useProject } from "./project-context";
import { cx, Notice, Spinner } from "./ui";

export const STEPS = [
  { slug: "brief", label: "النشاط", step: 1 },
  { slug: "media", label: "المواد", step: 2 },
  { slug: "setup", label: "الإعداد والفكرة", step: 3 },
  { slug: "script", label: "السيناريو والمشاهد", step: 5 },
  { slug: "produce", label: "التوليد والصوت", step: 5 },
  { slug: "editor", label: "المونتاج", step: 6 },
  { slug: "preview", label: "المعاينة", step: 6 },
  { slug: "export", label: "التصدير", step: 6 },
];

function Inner({ id, children }: { id: string; children: React.ReactNode }) {
  const { data, error, loading, activeJobs } = useProject();
  const path = usePathname();
  if (loading && !data) return <Spinner />;
  if (error && !data) return <Notice tone="danger" title="تعذّر فتح المشروع">{error.message}</Notice>;
  if (!data) return null;
  const current = STEPS.findIndex((s) => path.endsWith(`/${s.slug}`));
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
        <div>
          <Link href="/projects" className="text-xs font-bold text-muted hover:text-ink">← المشاريع</Link>
          <h1 className="font-display text-xl sm:text-2xl leading-snug">{data.project.title}</h1>
        </div>
        {activeJobs.length ? (
          <Link href={`/projects/${id}/produce`} className="inline-flex items-center gap-2 self-start rounded-full bg-teal-soft px-3 h-8 text-xs font-bold text-teal" aria-live="polite">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> {activeJobs.length} مهمة جارية
          </Link>
        ) : null}
      </div>
      <nav aria-label="خطوات المشروع" className="mb-6 -mx-4 px-4 overflow-x-auto">
        <ol className="flex gap-1.5 min-w-max">
          {STEPS.map((s, i) => {
            const done = data.project.wizard_step > s.step || (i < current && current >= 0);
            const active = i === current;
            return (
              <li key={s.slug}>
                <Link href={`/projects/${id}/${s.slug}`} aria-current={active ? "step" : undefined} className={cx("inline-flex items-center gap-2 rounded-xl px-3 h-10 text-sm font-bold border transition", active ? "bg-ink text-white border-ink" : "bg-surface border-line text-ink-2 hover:border-ink-2")}>
                  <span className={cx("grid size-5 place-items-center rounded-full text-[11px]", active ? "bg-white/20" : done ? "bg-ok-soft text-ok" : "bg-surface-2")}>{done && !active ? <Check className="size-3" aria-hidden /> : i + 1}</span>
                  {s.label}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
      {data.workspace.role === "viewer" ? <div className="mb-4"><Notice tone="info">لديك صلاحية عرض فقط في هذه المساحة.</Notice></div> : null}
      {children}
    </div>
  );
}

export function ProjectShell({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <ProjectProvider id={id}>
      <Inner id={id}>{children}</Inner>
    </ProjectProvider>
  );
}
