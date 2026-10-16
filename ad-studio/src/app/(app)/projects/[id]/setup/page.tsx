"use client";
import { Lightbulb, Sparkles, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { JobStatus } from "@/components/job-status";
import { useProject } from "@/components/project-context";
import { Badge, Button, Card, ChoiceGroup, Field, LinkButton, Notice, Select, Textarea } from "@/components/ui";
import { CHARACTER_TYPES, GOALS, LANGUAGES, MODES, PLATFORM_ASPECT, PLATFORMS, STYLES, VOICE_TONES, type ProjectSettings } from "@/lib/domain";
import { api, ApiError, newKey, useData } from "@/lib/client";

type Template = { id: string; name: string; description: string; preview: string; durations: number[]; business_types: string[]; scene_plan: { title: string; duration_s: number }[] };

export default function Setup() {
  const { data } = useProject();
  if (!data) return null;
  return <SetupForm initial={data.project.settings} />;
}

function SetupForm({ initial }: { initial: ProjectSettings }) {
  const { data, reload } = useProject();
  const [s, setS] = useState<ProjectSettings | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [directorJob, setDirectorJob] = useState<string | null>(null);
  const [ideasJob, setIdeasJob] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const { data: chars } = useData<{ characters: { id: string; name: string }[] }>("/api/characters");
  const { data: tpl } = useData<{ templates: Template[] }>(data ? `/api/templates?business_type=${data.brand.business_type}` : null);
  const jobs = useMemo(() => data?.jobs ?? [], [data?.jobs]);
  const ideas = useMemo(() => {
    const j = jobs.find((x) => x.id === ideasJob) ?? jobs.find((x) => x.type === "director" && x.status === "completed" && Array.isArray(x.output?.ideas));
    return j?.status === "completed" ? ((j.output?.ideas as { title: string; pitch: string; hook: string }[]) ?? []) : [];
  }, [jobs, ideasJob]);
  if (!data || !s) return null;
  const pid = data.project.id;
  const canEdit = data.workspace.role !== "viewer";
  const set = <K extends keyof ProjectSettings>(k: K) => (v: ProjectSettings[K]) => setS((x) => ({ ...x!, [k]: v, ...(k === "platform" ? { aspect: PLATFORM_ASPECT[v as keyof typeof PLATFORM_ASPECT] } : {}) }));

  async function save(step = 4) {
    setSaving(true);
    setError(null);
    try {
      await api(`/api/projects/${pid}`, { method: "PATCH", body: { settings: s, version: data!.project.version, wizard_step: step } });
      const fresh = await reload();
      if (fresh) setS(fresh.project.settings);
      return true;
    } catch (e) {
      setError(e as ApiError);
      if ((e as ApiError).code === "conflict") {
        const fresh = await reload();
        if (fresh) setS({ ...fresh.project.settings, ...s });
      }
      return false;
    } finally {
      setSaving(false);
    }
  }
  async function run(mode: "ideas" | "direct", chosen?: { title: string; pitch: string }) {
    if (!(await save(mode === "direct" ? 5 : 4))) return;
    try {
      const r = await api<{ job: { id: string }; missing_template_fields: string[] }>(`/api/projects/${pid}/director`, { body: { mode, idempotency_key: newKey("director"), chosen_idea: chosen } });
      setMissing(r.missing_template_fields ?? []);
      if (mode === "ideas") setIdeasJob(r.job.id);
      else setDirectorJob(r.job.id);
      await reload();
    } catch (e) {
      setError(e as ApiError);
    }
  }
  const dJob = jobs.find((j) => j.id === directorJob);
  const iJob = jobs.find((j) => j.id === ideasJob);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-6">
        <Card>
          <h2 className="font-display text-lg mb-5">إعداد الإعلان</h2>
          <div className="flex flex-col gap-6">
            <ChoiceGroup label="الأسلوب" value={s.style} onChange={set("style")} options={STYLES.list} />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="المدة (ثانية)" htmlFor="dur" hint="15 أو 30 أو 60، أو مدة مخصصة بين 6 و120">
                <Select id="dur" value={[15, 30, 60].includes(s.duration_s) ? String(s.duration_s) : "custom"} onChange={(e) => e.target.value !== "custom" && set("duration_s")(Number(e.target.value))} options={[{ value: "15", label: "15 ثانية" }, { value: "30", label: "30 ثانية" }, { value: "60", label: "60 ثانية" }, { value: "custom", label: "مدة مخصصة" }]} />
              </Field>
              <Field label="مدة مخصصة" htmlFor="durc"><input id="durc" type="number" min={6} max={120} value={s.duration_s} onChange={(e) => set("duration_s")(Math.max(6, Math.min(120, Number(e.target.value) || 30)))} className="h-11 rounded-xl border border-line bg-surface px-3 ltr text-end" /></Field>
            </div>
            <ChoiceGroup label="الهدف" value={s.goal} onChange={set("goal")} options={GOALS.list} />
            <ChoiceGroup label="الشخصية" value={s.character_type} onChange={set("character_type")} options={CHARACTER_TYPES.list} columns={2} />
            <ChoiceGroup label="المنصة المستهدفة" value={s.platform} onChange={set("platform")} options={PLATFORMS.list.map((p) => ({ ...p, hint: PLATFORM_ASPECT[p.value] }))} columns={4} />
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="اللغة واللهجة" htmlFor="lang"><Select id="lang" value={s.language} onChange={(e) => set("language")(e.target.value as ProjectSettings["language"])} options={LANGUAGES.list} /></Field>
              <Field label="الصوت" htmlFor="gender"><Select id="gender" value={s.voice_gender} onChange={(e) => set("voice_gender")(e.target.value as "male" | "female")} options={[{ value: "male", label: "رجالي" }, { value: "female", label: "نسائي" }]} /></Field>
              <Field label="نبرة الإلقاء" htmlFor="tone"><Select id="tone" value={s.voice_tone} onChange={(e) => set("voice_tone")(e.target.value as ProjectSettings["voice_tone"])} options={VOICE_TONES.list} /></Field>
            </div>
            {chars?.characters.length ? <Field label="شخصية محفوظة (اختياري)" htmlFor="char" hint="يحافظ المخرج على شكلها وملابسها بين المشاهد"><Select id="char" value={s.character_id ?? ""} onChange={(e) => set("character_id")(e.target.value || null)} options={[{ value: "", label: "— بدون —" }, ...chars.characters.map((c) => ({ value: c.id, label: c.name }))]} /></Field> : null}
            <p className="text-xs text-muted">الأصوات واللهجات المتاحة فعليًا تُختار في خطوة «التوليد والصوت» حسب مزود الصوت المتصل.</p>
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-lg mb-5">طريقة العمل</h2>
          <ChoiceGroup label="كيف تريد أن نبدأ؟" value={s.mode} onChange={set("mode")} options={MODES.list.map((m) => ({ ...m, hint: m.value === "auto" ? "نقترح الفكرة والسيناريو والمشاهد" : m.value === "own_idea" ? "اكتب فكرتك أو السيناريو ونحوّله لخطة إنتاج" : "اختر قالبًا ونخصصه لنشاطك" }))} />
          {s.mode === "own_idea" ? (
            <div className="mt-5"><Field label="فكرتك أو السيناريو" htmlFor="idea" hint="اكتب السيناريو كاملًا إن كان جاهزًا، وسنقسّمه على المشاهد بتوقيتها. [اسم المطعم] و[اسم النشاط] تُستبدل باسم نشاطك.">
              <Textarea id="idea" value={s.own_idea} onChange={(e) => set("own_idea")(e.target.value)} className="min-h-40" maxLength={4000} />
            </Field></div>
          ) : null}
          {s.mode === "template" ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {(tpl?.templates ?? []).map((t) => (
                <button key={t.id} type="button" onClick={() => set("template_id")(t.id)} aria-pressed={s.template_id === t.id} className={`rounded-2xl border p-4 text-start transition ${s.template_id === t.id ? "border-ink ring-2 ring-ink" : "border-line hover:border-ink-2"}`}>
                  <p className="font-bold">{t.name}</p>
                  <p className="text-xs text-ink-2 mt-1">{t.description}</p>
                  <p className="text-xs text-muted mt-2">{t.scene_plan.length} مشاهد · {t.durations.join("/")} ث</p>
                </button>
              ))}
              {!tpl?.templates.length ? <p className="text-sm text-muted">لا توجد قوالب لهذا النوع من النشاط. <Link href="/templates" className="text-accent font-bold">تصفح كل القوالب</Link></p> : null}
            </div>
          ) : null}
          <div className="mt-5"><Field label="تعليمات إضافية (اختياري)" htmlFor="ins"><Textarea id="ins" value={s.instructions} onChange={(e) => set("instructions")(e.target.value)} maxLength={2000} placeholder="مثال: ركّز على الجلسات العائلية، وتجنب لقطات الطبخ" /></Field></div>
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-24 self-start">
        <Card>
          <h2 className="font-display text-lg mb-3">المخرج الإبداعي</h2>
          <p className="text-sm text-ink-2 mb-4">يبني خطة إنتاج كاملة: الفكرة، السيناريو الصوتي، والمشاهد بتوقيتها وبرومبت لكل مشهد، من بياناتك فقط.</p>
          {error ? <div className="mb-3"><Notice tone="danger">{error.message}</Notice></div> : null}
          {missing.length ? <div className="mb-3"><Notice tone="warn" title="حقول لم تُعبّأ">حُذفت من القالب الأسطر التي تعتمد عليها بدل اختراع قيم: {missing.join("، ")}</Notice></div> : null}
          <div className="flex flex-col gap-2">
            {s.mode === "auto" ? <Button variant="secondary" onClick={() => run("ideas")} loading={saving && !directorJob} disabled={!canEdit} icon={<Lightbulb className="size-4" />}>اقترح أفكارًا</Button> : null}
            <Button onClick={() => run("direct")} disabled={!canEdit || (s.mode === "own_idea" && !s.own_idea.trim()) || (s.mode === "template" && !s.template_id)} icon={<Wand2 className="size-4" />}>{data.script ? "أعد توليد السيناريو" : "ولّد السيناريو والمشاهد"}</Button>
            <Button variant="ghost" onClick={() => save()} loading={saving} disabled={!canEdit}>حفظ الإعدادات فقط</Button>
          </div>
          {iJob ? <div className="mt-4"><JobStatus job={iJob} onChange={reload} /></div> : null}
          {dJob ? <div className="mt-4"><JobStatus job={dJob} onChange={reload} /></div> : null}
          {dJob?.status === "completed" ? <div className="mt-3"><LinkButton href={`/projects/${pid}/script`} className="w-full">افتح السيناريو والمشاهد</LinkButton></div> : null}
          {data.script ? <p className="text-xs text-muted mt-3">يوجد سيناريو حالي (النسخة {data.script.version}). إعادة التوليد تنشئ نسخة جديدة وتحتفظ بالقديمة.</p> : null}
        </Card>
        {ideas.length ? (
          <Card>
            <h3 className="font-bold mb-3 flex items-center gap-2"><Sparkles className="size-4 text-accent" aria-hidden /> أفكار مقترحة {jobs.find((j) => j.id === ideasJob)?.is_simulated ? <Badge tone="warn">محاكاة</Badge> : null}</h3>
            <ul className="flex flex-col gap-3">
              {ideas.map((i) => (
                <li key={i.title} className="rounded-xl border border-line p-3">
                  <p className="font-bold text-sm">{i.title}</p>
                  <p className="text-xs text-ink-2 mt-1">{i.pitch}</p>
                  {i.hook ? <p className="text-xs text-muted mt-1">الخطاف: {i.hook}</p> : null}
                  <Button variant="secondary" className="h-9 mt-2 text-xs" onClick={() => run("direct", { title: i.title, pitch: i.pitch })} disabled={!canEdit}>اعتمد هذه الفكرة</Button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
