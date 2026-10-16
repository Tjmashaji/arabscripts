"use client";
import { ChevronDown, Copy, CopyPlus, FileText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useProject, type Scene } from "@/components/project-context";
import { SceneList } from "@/components/scene-list";
import { Badge, Button, Card, EmptyState, Field, Input, LinkButton, Notice, Select, SimBadge, Textarea } from "@/components/ui";
import { useScenes } from "@/components/use-scenes";
import { TRANSITIONS, type DirectorOutput } from "@/lib/domain";
import { api, ApiError } from "@/lib/client";

const sec = (ms: number) => (ms / 1000).toFixed(1).replace(/\.0$/, "");

// حقل نصي يحفظ عند مغادرة الحقل فقط إذا تغيّرت قيمته
type AutoProps = { label: string; value: string; onSave: (v: string) => void; multiline?: boolean; ltr?: boolean; hint?: string; disabled?: boolean };
function Auto(p: AutoProps) {
  return <AutoInner key={p.value} {...p} />;
}
function AutoInner({ label, value, onSave, multiline, ltr, hint, disabled }: AutoProps) {
  const [v, setV] = useState(value);
  const id = label.replace(/\s/g, "-");
  const props = { id, value: v, disabled, onChange: (e: { target: { value: string } }) => setV(e.target.value), onBlur: () => v !== value && onSave(v), className: ltr ? "ltr text-start" : undefined, dir: ltr ? "ltr" : undefined };
  return <Field label={label} htmlFor={id} hint={hint}>{multiline ? <Textarea {...props} /> : <Input {...props} />}</Field>;
}

function SceneCard({ scene, start, canEdit }: { scene: Scene; start: number; canEdit: boolean }) {
  const { patch, duplicate, remove, saving } = useScenes();
  const [open, setOpen] = useState(scene.position === 0);
  const [copied, setCopied] = useState(false);
  const save = (k: keyof Scene) => (v: string) => void patch(scene, { [k]: v } as Partial<Scene>);
  async function copy() {
    const text = [scene.visual_prompt, scene.camera && `Camera: ${scene.camera}`, scene.lighting && `Lighting: ${scene.lighting}`, scene.negative_prompt && `Negative: ${scene.negative_prompt}`].filter(Boolean).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="w-full flex items-center gap-3 p-4 text-start">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-white text-sm font-bold">{scene.position + 1}</span>
        <span className="flex-1 min-w-0">
          <span className="block font-bold truncate">{scene.title}</span>
          <span className="block text-xs text-muted truncate">{scene.voiceover || scene.on_screen_text || "—"}</span>
        </span>
        <span className="text-xs text-muted ltr shrink-0">{sec(start)}–{sec(start + scene.duration_ms)}s</span>
        {saving === scene.id ? <Badge tone="info">يحفظ…</Badge> : null}
        <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open ? (
        <div className="border-t border-line p-4 grid gap-4 md:grid-cols-2">
          <Auto label="عنوان المشهد" value={scene.title} onSave={save("title")} disabled={!canEdit} />
          <Field label="المدة (ثانية)" htmlFor={`d-${scene.id}`}>
            <Input id={`d-${scene.id}`} type="number" step={0.5} min={0.5} max={60} defaultValue={scene.duration_ms / 1000} disabled={!canEdit} className="ltr text-end" onBlur={(e) => { const ms = Math.round(Number(e.target.value) * 1000); if (ms !== scene.duration_ms && ms >= 500) void patch(scene, { duration_ms: ms }); }} />
          </Field>
          <div className="md:col-span-2"><Auto label="التعليق الصوتي" value={scene.voiceover} onSave={save("voiceover")} multiline disabled={!canEdit} hint={`نحو ${Math.round((scene.duration_ms / 1000) * 2.3)} كلمة تناسب مدة المشهد`} /></div>
          <Auto label="النص على الشاشة" value={scene.on_screen_text} onSave={save("on_screen_text")} disabled={!canEdit} />
          <Field label="الانتقال إلى هذا المشهد" htmlFor={`t-${scene.id}`}><Select id={`t-${scene.id}`} value={scene.transition} onChange={(e) => void patch(scene, { transition: e.target.value })} options={TRANSITIONS.list} disabled={!canEdit} /></Field>
          <div className="md:col-span-2"><Auto label="البرومبت المرئي (إنجليزي لنماذج الفيديو)" value={scene.visual_prompt} onSave={save("visual_prompt")} multiline ltr disabled={!canEdit} /></div>
          <Auto label="حركة الكاميرا وزاويتها" value={scene.camera} onSave={save("camera")} ltr disabled={!canEdit} />
          <Auto label="الإضاءة والأجواء" value={scene.lighting} onSave={save("lighting")} ltr disabled={!canEdit} />
          <Auto label="تعليمات سلبية (ما يجب تجنبه)" value={scene.negative_prompt} onSave={save("negative_prompt")} ltr disabled={!canEdit} />
          <Auto label="المؤثرات الصوتية" value={scene.sfx} onSave={save("sfx")} disabled={!canEdit} />
          <Auto label="تعليمات المونتاج" value={scene.editing_notes} onSave={save("editing_notes")} disabled={!canEdit} />
          <Auto label="الاستمرارية البصرية" value={scene.continuity} onSave={save("continuity")} disabled={!canEdit} />
          <div className="md:col-span-2 flex flex-wrap gap-2 pt-1">
            <Button variant="secondary" className="h-9 text-sm" onClick={copy} icon={<Copy className="size-4" />}>{copied ? "نُسخ" : "نسخ البرومبت"}</Button>
            <Button variant="ghost" className="h-9 text-sm" onClick={() => duplicate(scene.id)} disabled={!canEdit} icon={<CopyPlus className="size-4" />}>تكرار</Button>
            <Button variant="ghost" className="h-9 text-sm text-danger ms-auto" onClick={() => remove(scene.id)} disabled={!canEdit} icon={<Trash2 className="size-4" />}>حذف</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Meta({ content, pid, canEdit, onSaved }: { content: DirectorOutput; pid: string; canEdit: boolean; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const save = (k: keyof DirectorOutput) => async (v: string) => {
    try {
      await api(`/api/projects/${pid}/script`, { method: "PATCH", body: { [k]: v } });
      onSaved();
    } catch (e) {
      setError((e as ApiError).message);
    }
  };
  return (
    <div className="grid gap-4">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Auto label="اسم الحملة" value={content.campaign_name} onSave={save("campaign_name")} disabled={!canEdit} />
      <Auto label="الفكرة الرئيسية" value={content.core_idea} onSave={save("core_idea")} multiline disabled={!canEdit} />
      <Auto label="الرسالة التسويقية" value={content.marketing_message} onSave={save("marketing_message")} multiline disabled={!canEdit} />
      <Auto label="الخطاف الافتتاحي" value={content.hook} onSave={save("hook")} disabled={!canEdit} />
      <Auto label="دعوة اتخاذ الإجراء" value={content.cta} onSave={save("cta")} disabled={!canEdit} />
      <Auto label="متطلبات الاستمرارية" value={content.continuity_requirements} onSave={save("continuity_requirements")} multiline disabled={!canEdit} />
    </div>
  );
}

export default function Script() {
  const { data, reload } = useProject();
  const { reorder, add, error, setError } = useScenes();
  if (!data) return null;
  const pid = data.project.id;
  const canEdit = data.workspace.role !== "viewer";
  if (!data.script && !data.scenes.length)
    return (
      <EmptyState icon={<FileText className="size-7" />} title="لا يوجد سيناريو بعد" action={<LinkButton href={`/projects/${pid}/setup`}>اذهب إلى الإعداد والفكرة</LinkButton>}>
        اختر طريقة العمل ودع المخرج الإبداعي يكتب السيناريو، أو أضف المشاهد يدويًا.
      </EmptyState>
    );
  const total = data.scenes.reduce((a, s) => a + s.duration_ms, 0);
  const target = data.project.settings.duration_s * 1000;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg">المشاهد ({data.scenes.length})</h2>
          <Badge tone={Math.abs(total - target) < 600 ? "ok" : "warn"}>المجموع {sec(total)} ث من {sec(target)} ث</Badge>
          <Button variant="secondary" className="ms-auto h-9 text-sm" onClick={() => add(null)} disabled={!canEdit} icon={<Plus className="size-4" />}>إضافة مشهد</Button>
        </div>
        {error ? <Notice tone="danger" action={<button className="text-sm font-bold" onClick={() => setError(null)}>إغلاق</button>}>{error}</Notice> : null}
        <SceneList scenes={data.scenes} onReorder={reorder} disabled={!canEdit} render={(s, start) => <SceneCard scene={s} start={start} canEdit={canEdit} />} />
        <div className="flex justify-end"><LinkButton href={`/projects/${pid}/produce`}>التالي: التوليد والصوت</LinkButton></div>
      </div>
      <Card className="self-start lg:sticky lg:top-24">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-display text-lg">السيناريو</h2>
          {data.script ? <Badge>النسخة {data.script.version}</Badge> : null}
          {data.script?.source === "simulation" ? <SimBadge /> : null}
        </div>
        {data.script?.source === "simulation" ? <div className="mb-4"><Notice tone="warn">كُتب هذا السيناريو بالمحاكاة التطويرية من بياناتك فقط، وليس بنموذج ذكاء اصطناعي. فعّل المخرج الإبداعي الحقيقي من الإعدادات.</Notice></div> : null}
        {data.script ? <Meta content={data.script.content} pid={pid} canEdit={canEdit} onSaved={() => void reload()} /> : <p className="text-sm text-muted">المشاهد أُضيفت يدويًا.</p>}
      </Card>
    </div>
  );
}
