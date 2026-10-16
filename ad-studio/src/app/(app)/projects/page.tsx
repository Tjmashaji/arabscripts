"use client";
import { Clapperboard, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { BUSINESS_TYPES, PLATFORMS } from "@/lib/domain";
import { api, fmtDate, useData } from "@/lib/client";
import { Badge, Button, EmptyState, LinkButton, Notice, PageHeader, Spinner } from "@/components/ui";

type Row = { id: string; title: string; status: string; wizard_step: number; updated_at: string; brand_name: string; business_type: string; scenes: number; thumb_id: string | null; last_export_id: string | null; settings: { platform: keyof typeof PLATFORMS.label; duration_s: number } };
const STATUS: Record<string, { label: string; tone: "neutral" | "info" | "warn" | "accent" | "ok" }> = {
  draft: { label: "مسودة", tone: "neutral" },
  scripting: { label: "السيناريو", tone: "info" },
  producing: { label: "الإنتاج", tone: "warn" },
  editing: { label: "المونتاج", tone: "accent" },
  exported: { label: "مُصدَّر", tone: "ok" },
};
const STEP_PATH = ["", "brief", "media", "setup", "setup", "script", "export"];

export default function Projects() {
  const { data, error, loading, reload } = useData<{ projects: Row[]; workspace: { name: string; role: string } }>("/api/projects");
  async function remove(id: string, title: string) {
    if (!confirm(`حذف «${title}»؟ يمكن للمسؤول استرجاعه من قاعدة البيانات خلال مدة الاحتفاظ.`)) return;
    await api(`/api/projects/${id}`, { method: "DELETE" });
    void reload();
  }
  return (
    <>
      <PageHeader eyebrow={data?.workspace.name} title="مشاريعك الإعلانية" subtitle="كل مشروع يحفظ تقدمك تلقائيًا، وتكمل من حيث توقفت." actions={<LinkButton href="/projects/new" icon={<Plus className="size-4" />}>مشروع جديد</LinkButton>} />
      {loading ? <Spinner /> : error ? <Notice tone="danger">{error.message}</Notice> : !data?.projects.length ? (
        <EmptyState icon={<Clapperboard className="size-7" />} title="ابدأ إعلانك الأول" action={<LinkButton href="/projects/new" icon={<Plus className="size-4" />}>أنشئ مشروعًا</LinkButton>}>
          أدخل بيانات نشاطك، ارفع صورك ومقاطعك، ونقترح عليك فكرة وسيناريو ومشاهد جاهزة للتنفيذ.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.projects.map((p) => (
            <li key={p.id} className="group rounded-[var(--radius-card)] border border-line bg-surface overflow-hidden flex flex-col">
              <Link href={`/projects/${p.id}/${STEP_PATH[p.wizard_step] ?? "script"}`} className="block">
                <div className="aspect-video bg-surface-2 relative overflow-hidden">
                  {p.thumb_id ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${p.thumb_id}`} alt="" className="size-full object-cover transition group-hover:scale-[1.02]" />
                  ) : (
                    <div className="size-full grid place-items-center text-muted"><Clapperboard className="size-8" aria-hidden /></div>
                  )}
                  <Badge tone={STATUS[p.status]?.tone} className="absolute top-3 start-3">{STATUS[p.status]?.label ?? p.status}</Badge>
                </div>
                <div className="p-4">
                  <h2 className="font-bold leading-snug">{p.title}</h2>
                  <p className="text-xs text-muted mt-1">{p.brand_name} · {BUSINESS_TYPES.label[p.business_type as keyof typeof BUSINESS_TYPES.label]}</p>
                  <p className="text-xs text-muted mt-2">{PLATFORMS.label[p.settings.platform]} · {p.settings.duration_s} ث · {p.scenes} مشاهد</p>
                </div>
              </Link>
              <div className="mt-auto flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-muted">
                <span>آخر تعديل {fmtDate(p.updated_at)}</span>
                <Button variant="ghost" className="h-8 px-2" onClick={() => remove(p.id, p.title)} aria-label={`حذف ${p.title}`}><Trash2 className="size-4" /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
