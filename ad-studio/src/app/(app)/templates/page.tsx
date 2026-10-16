"use client";
import { Copy, LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { BUSINESS_TYPES, GOALS, PLATFORMS, STYLES } from "@/lib/domain";
import { api, ApiError, useData } from "@/lib/client";

type Template = { id: string; workspace_id: string | null; name: string; description: string; preview: string; business_types: string[]; goals: string[]; styles: string[]; durations: number[]; platforms: string[]; required_fields: string[]; base_prompt: string; negative_prompt: string; scene_plan: { title: string; duration_s: number; goal: string }[]; editing_notes: string; variables: { key: string; label: string }[] };
const any = { value: "", label: "الكل" };

const blank = { name: "", description: "", preview: "", business_types: [] as string[], goals: [] as string[], styles: [] as string[], durations: [30], platforms: [] as string[], base_prompt: "", negative_prompt: "", scene_plan: [] as Template["scene_plan"], editing_notes: "" };

export default function Templates() {
  const [f, setF] = useState({ business_type: "", goal: "", style: "", duration: "", platform: "", q: "" });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data, loading, error, reload } = useData<{ templates: Template[] }>(`/api/templates?${qs}`);
  const [view, setView] = useState<Template | null>(null);
  const [edit, setEdit] = useState<(typeof blank & { id?: string }) | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function copy(t: Template) {
    const r = await api<{ template: Template }>(`/api/templates/${t.id}/copy`, { body: {} });
    setView(null);
    setMsg(`نُسخ القالب «${t.name}» إلى قوالبك. يمكنك تعديله الآن.`);
    await reload();
    setEdit({ ...r.template, id: r.template.id });
  }
  async function save() {
    if (!edit) return;
    setBusy(true);
    try {
      const { id, ...body } = edit;
      await api(id ? `/api/templates/${id}` : "/api/templates", { method: id ? "PATCH" : "POST", body });
      setEdit(null);
      setMsg("حُفظ القالب.");
      await reload();
    } catch (e) {
      setMsg((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(t: Template) {
    if (!confirm(`حذف القالب «${t.name}»؟`)) return;
    await api(`/api/templates/${t.id}`, { method: "DELETE" });
    await reload();
  }
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <>
      <PageHeader title="مكتبة القوالب والأفكار" subtitle="قوالب برومبتات ومشاهد جاهزة حسب النشاط والهدف والأسلوب. انسخ أي قالب وعدّله ليصبح قالبك." actions={<Button onClick={() => setEdit({ ...blank })} icon={<Plus className="size-4" />}>قالب جديد</Button>} />
      <Card className="mb-6">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="بحث" htmlFor="q"><Input id="q" value={f.q} onChange={set("q")} placeholder="مطعم، عطر…" /></Field>
          <Field label="النشاط" htmlFor="bt"><Select id="bt" value={f.business_type} onChange={set("business_type")} options={[any, ...BUSINESS_TYPES.list]} /></Field>
          <Field label="الهدف" htmlFor="gl"><Select id="gl" value={f.goal} onChange={set("goal")} options={[any, ...GOALS.list]} /></Field>
          <Field label="الأسلوب" htmlFor="st"><Select id="st" value={f.style} onChange={set("style")} options={[any, ...STYLES.list]} /></Field>
          <Field label="المدة" htmlFor="du"><Select id="du" value={f.duration} onChange={set("duration")} options={[any, { value: "15", label: "15 ث" }, { value: "30", label: "30 ث" }, { value: "60", label: "60 ث" }]} /></Field>
          <Field label="المنصة" htmlFor="pl"><Select id="pl" value={f.platform} onChange={set("platform")} options={[any, ...PLATFORMS.list]} /></Field>
        </div>
      </Card>
      {msg ? <div className="mb-4"><Notice tone="info" action={<button className="text-sm font-bold" onClick={() => setMsg(null)}>إغلاق</button>}>{msg}</Notice></div> : null}
      {loading ? <Spinner /> : error ? <Notice tone="danger">{error.message}</Notice> : !data?.templates.length ? (
        <EmptyState icon={<LayoutTemplate className="size-7" />} title="لا توجد قوالب بهذه المعايير">جرّب إزالة بعض عوامل التصفية.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.templates.map((t) => (
            <li key={t.id} className="rounded-[var(--radius-card)] border border-line bg-surface p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-bold">{t.name}</h2>
                {t.workspace_id ? <Badge tone="accent">قالبي</Badge> : <Badge>نظام</Badge>}
              </div>
              <p className="text-sm text-ink-2">{t.description}</p>
              {t.preview ? <p className="rounded-xl bg-surface-2 p-3 text-sm">«{t.preview}»</p> : null}
              <div className="flex flex-wrap gap-1.5">
                {t.styles.map((s) => <Badge key={s} tone="info">{STYLES.label[s as keyof typeof STYLES.label] ?? s}</Badge>)}
                {t.durations.map((d) => <Badge key={d}>{d} ث</Badge>)}
                <Badge>{t.scene_plan.length} مشاهد</Badge>
              </div>
              <div className="mt-auto flex gap-2 pt-1">
                <Button variant="secondary" className="h-9 text-sm" onClick={() => setView(t)}>التفاصيل</Button>
                {t.workspace_id ? (
                  <>
                    <Button variant="ghost" className="h-9 text-sm" onClick={() => setEdit({ ...t, id: t.id })} icon={<Pencil className="size-4" />}>تعديل</Button>
                    <Button variant="ghost" className="h-9 text-sm text-danger ms-auto" onClick={() => remove(t)} aria-label="حذف"><Trash2 className="size-4" /></Button>
                  </>
                ) : <Button variant="ghost" className="h-9 text-sm" onClick={() => copy(t)} icon={<Copy className="size-4" />}>نسخ وتعديل</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={Boolean(view)} onClose={() => setView(null)} title={view?.name ?? ""} wide footer={view && !view.workspace_id ? <Button onClick={() => copy(view)} icon={<Copy className="size-4" />}>نسخ إلى قوالبي</Button> : undefined}>
        {view ? (
          <div className="grid gap-4 text-sm">
            <div><p className="font-bold mb-1">البرومبت الأساسي</p><pre className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 ltr text-start text-xs" dir="ltr">{view.base_prompt}</pre></div>
            <p className="text-xs text-muted">المتغيرات بين {"{{ }}"} تُملأ من بيانات نشاطك. السطر الذي يعتمد على حقل فارغ (مثل العرض أو السعر) يُحذف تلقائيًا بدل اختراع قيمة.</p>
            {view.negative_prompt ? <div><p className="font-bold mb-1">تعليمات سلبية</p><p className="ltr text-start text-xs" dir="ltr">{view.negative_prompt}</p></div> : null}
            <div><p className="font-bold mb-2">خطة المشاهد</p><ol className="grid gap-2">{view.scene_plan.map((s, i) => <li key={i} className="rounded-xl border border-line p-2.5"><span className="font-bold">{i + 1}. {s.title}</span> <span className="text-muted">· {s.duration_s} ث</span><p className="text-xs ltr text-start text-ink-2" dir="ltr">{s.goal}</p></li>)}</ol></div>
            {view.editing_notes ? <div><p className="font-bold mb-1">تعليمات المونتاج</p><p>{view.editing_notes}</p></div> : null}
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? "تعديل القالب" : "قالب جديد"} wide footer={<><Button variant="secondary" onClick={() => setEdit(null)}>إلغاء</Button><Button onClick={save} loading={busy} disabled={!edit?.name.trim() || !edit?.base_prompt.trim()}>حفظ</Button></>}>
        {edit ? (
          <div className="grid gap-4">
            <Field label="الاسم" htmlFor="tn"><Input id="tn" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="الوصف" htmlFor="td"><Textarea id="td" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="البرومبت الأساسي" htmlFor="tp" hint="استخدم {{business_name}} و{{product}} و{{city}} و{{offer}} و{{differentiator}} و{{audience}} و{{contact}}"><Textarea id="tp" dir="ltr" className="ltr text-start min-h-32" value={edit.base_prompt} onChange={(e) => setEdit({ ...edit, base_prompt: e.target.value })} /></Field>
            <Field label="تعليمات سلبية" htmlFor="tneg"><Input id="tneg" dir="ltr" className="ltr text-start" value={edit.negative_prompt} onChange={(e) => setEdit({ ...edit, negative_prompt: e.target.value })} /></Field>
            <div>
              <p className="text-sm font-bold mb-2">خطة المشاهد</p>
              {edit.scene_plan.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_2fr_auto] gap-2 mb-2">
                  <Input aria-label="العنوان" value={s.title} onChange={(e) => setEdit({ ...edit, scene_plan: edit.scene_plan.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                  <Input aria-label="المدة" type="number" className="ltr" value={s.duration_s} onChange={(e) => setEdit({ ...edit, scene_plan: edit.scene_plan.map((x, j) => (j === i ? { ...x, duration_s: Number(e.target.value) } : x)) })} />
                  <Input aria-label="الهدف" dir="ltr" className="ltr text-start" value={s.goal} onChange={(e) => setEdit({ ...edit, scene_plan: edit.scene_plan.map((x, j) => (j === i ? { ...x, goal: e.target.value } : x)) })} />
                  <Button variant="ghost" className="px-2" aria-label="حذف المشهد" onClick={() => setEdit({ ...edit, scene_plan: edit.scene_plan.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button variant="secondary" className="h-9 text-sm" onClick={() => setEdit({ ...edit, scene_plan: [...edit.scene_plan, { title: "مشهد", duration_s: 5, goal: "" }] })} icon={<Plus className="size-4" />}>إضافة مشهد</Button>
            </div>
            <Field label="تعليمات المونتاج" htmlFor="te"><Textarea id="te" value={edit.editing_notes} onChange={(e) => setEdit({ ...edit, editing_notes: e.target.value })} /></Field>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
