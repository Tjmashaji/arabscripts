"use client";
import { ArrowDown, ArrowUp, Copy, Download, Film, Plus, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, useData } from "@/lib/client";
import { fmtBytes, fmtDate, fmtSec } from "@/lib/format";
import { AGES, BACKGROUNDS, CATEGORIES, LIMITS, MUSIC, sceneDurationMs, VOICE_MODES, type Music, type SceneInput, type VoiceMode } from "@/lib/domain";
import type { ProjectPayload } from "@/server/services/payload";
import { Emoji } from "./emoji";
import { EmojiPicker } from "./emoji-picker";
import { isActive, JobStatus } from "./job-status";
import { PublishPanel } from "./publish-panel";
import { Recorder } from "./recorder";
import { ScenePreview } from "./scene-preview";
import { Badge, Button, Card, cx, Input, Notice, Select, Spinner, Textarea } from "./ui";

type Audio = ProjectPayload["project"]["scenes"][number]["audio"];
const strip = (s: ProjectPayload["project"]["scenes"]): SceneInput[] => s.map(({ id, narration, text, emoji, bg }) => ({ id, narration, text, emoji, bg }));
const newId = () => `s${Math.random().toString(36).slice(2, 8)}`;

export function Editor({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, reload, setData } = useData<ProjectPayload>(`/api/projects/${id}`, (d) => (d?.jobs.some(isActive) ? 1500 : null));
  const [scenes, setScenes] = useState<SceneInput[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const scriptJobSeen = useRef<string | null>(null);

  // المشاهد المحلية مصدر الحقيقة أثناء التحرير؛ تُستبدل فقط عند التحميل الأول أو عند انتهاء كتابة المخرج الذكي
  useEffect(() => {
    if (!data) return;
    const script = data.jobs.find((j) => j.kind === "script");
    const scriptDone = script?.status === "completed" && scriptJobSeen.current !== script.id;
    if (scenes === null || scriptDone) {
      if (script) scriptJobSeen.current = script.id;
      setScenes(strip(data.project.scenes));
    }
  }, [data, scenes]);

  // حفظ تلقائي بعد توقف الكتابة
  useEffect(() => {
    if (saveState !== "dirty" || !scenes) return;
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        setData(await api<ProjectPayload>(`/api/projects/${id}`, { method: "PATCH", body: { scenes } }));
        setSaveState((s) => (s === "saving" ? "saved" : s));
        setSaveError(null);
      } catch (e) {
        setSaveState("error");
        setSaveError((e as ApiError).message);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [scenes, saveState, id, setData]);

  if (error && !data) return <Notice tone="danger">{error.message}</Notice>;
  if (!data || !scenes) return <Spinner />;
  const p = data.project;
  const jobOf = (k: string) => data.jobs.find((j) => j.kind === k);
  const scriptJob = jobOf("script");

  function edit(next: SceneInput[]) {
    setScenes(next);
    setSaveState("dirty");
  }
  const patchScene = (i: number, patch: Partial<SceneInput>) => edit(scenes!.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const next = [...scenes];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    edit(next);
    setSelected(i + d);
  };

  async function saveSettings(patch: { voiceMode?: VoiceMode; music?: Music; title?: string }) {
    try {
      setData(await api<ProjectPayload>(`/api/projects/${id}`, { method: "PATCH", body: patch }));
    } catch (e) {
      setActionError((e as ApiError).message);
    }
  }

  async function run(path: string) {
    setActionError(null);
    try {
      await api(`/api/projects/${id}/${path}`, { body: {} });
      await reload();
    } catch (e) {
      const a = e as ApiError;
      setActionError(Array.isArray(a.details) ? (a.details as string[]).join(" ") : a.message);
    }
  }

  async function remove() {
    if (!confirm("حذف هذا المقطع وكل ملفاته؟ لا يمكن التراجع.")) return;
    await api(`/api/projects/${id}`, { method: "DELETE" });
    router.replace("/dashboard");
    router.refresh();
  }

  const audioOf = (sid: string): Audio => p.scenes.find((s) => s.id === sid)?.audio ?? null;
  const fresh = (s: SceneInput) => {
    const a = audioOf(s.id);
    return Boolean(a && a.text.trim() === s.narration.trim());
  };
  const voiced = p.voiceMode !== "none";
  const missing = voiced ? scenes.filter((s) => s.narration.trim() && !fresh(s)).length : 0;
  const totalMs = scenes.reduce((a, s) => a + sceneDurationMs({ ...s, audio: voiced && fresh(s) ? audioOf(s.id) : null }), 0);
  const render = data.renders[0];
  const outdated = render && render.projectVersion < p.version;
  const sel = scenes[Math.min(selected, scenes.length - 1)];

  return (
    <div className="grid gap-6">
      {/* ───── العنوان ───── */}
      <header className="flex flex-wrap items-center gap-3">
        <input
          defaultValue={p.title}
          onBlur={(e) => e.target.value.trim() && e.target.value !== p.title && saveSettings({ title: e.target.value.trim() })}
          aria-label="عنوان المقطع"
          maxLength={80}
          className="font-display text-2xl sm:text-3xl bg-transparent outline-none border-b-2 border-transparent focus:border-accent min-w-0 basis-full sm:basis-auto flex-1"
        />
        <Badge tone="accent">{CATEGORIES[p.category].label}</Badge>
        <Badge>{AGES[p.age]}</Badge>
        <Badge tone={totalMs > LIMITS.totalMs ? "danger" : "info"}>≈ {fmtSec(totalMs)}</Badge>
        <span className="text-xs text-muted" aria-live="polite">{saveState === "saving" ? "جارٍ الحفظ…" : saveState === "dirty" ? "تعديلات غير محفوظة" : saveState === "error" ? "تعذّر الحفظ" : "محفوظ"}</span>
        <Button variant="ghost" onClick={remove} icon={<Trash2 className="size-4" />} aria-label="حذف المقطع" />
      </header>
      {saveError ? <Notice tone="danger">{saveError}</Notice> : null}
      {actionError ? <Notice tone="danger" action={<button onClick={() => setActionError(null)} aria-label="إغلاق"><X className="size-4" /></button>}>{actionError}</Notice> : null}

      {isActive(scriptJob) ? (
        <Card className="text-center py-10">
          <Sparkles className="size-8 text-accent mx-auto mb-3" aria-hidden />
          <p className="font-display text-lg mb-4">المخرج الذكي يكتب درس «{p.subject}»</p>
          <div className="max-w-md mx-auto"><JobStatus job={scriptJob} onChange={reload} /></div>
        </Card>
      ) : (
        <>
          {scriptJob?.status === "failed" ? <Notice tone="danger" action={<Button variant="secondary" onClick={() => run("script")}>أعد المحاولة</Button>}>{scriptJob.error}</Notice> : null}

          {/* ───── المشاهد والمعاينة ───── */}
          <div className="grid gap-6 lg:grid-cols-[300px_1fr] items-start">
            <div className="lg:sticky lg:top-20">
              <ScenePreview scene={sel} index={selected} total={scenes.length} />
              <p className="text-xs text-muted text-center mt-2">معاينة المشهد المحدد · المقطع النهائي 1080×1920</p>
            </div>
            <div className="grid gap-3">
              {p.category === "custom" && data.services.claude ? (
                <div className="flex justify-end"><Button variant="ghost" onClick={() => confirm("إعادة كتابة الدرس تستبدل كل المشاهد الحالية. متابعة؟") && run("script")} icon={<Wand2 className="size-4" />}>أعد كتابة الدرس بالمخرج الذكي</Button></div>
              ) : null}
              {scenes.map((s, i) => {
                const a = audioOf(s.id);
                return (
                  <Card key={s.id} as="article" className={cx("p-4 sm:p-4 transition", i === selected && "ring-2 ring-accent")}>
                    <div onFocusCapture={() => setSelected(i)} onClick={() => setSelected(i)} className="grid gap-3">
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 place-items-center rounded-lg text-white text-sm font-bold" style={{ background: s.bg }}>{i + 1}</span>
                        <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label={`لون خلفية المشهد ${i + 1}`}>
                          {BACKGROUNDS.map((c) => (
                            <button key={c} type="button" role="radio" aria-checked={s.bg === c} aria-label={c} onClick={() => patchScene(i, { bg: c })} className={cx("size-5 rounded-full border-2", s.bg === c ? "border-ink" : "border-transparent")} style={{ background: c }} />
                          ))}
                        </div>
                        <div className="ms-auto flex">
                          <IconBtn label="أعلى" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></IconBtn>
                          <IconBtn label="أسفل" disabled={i === scenes.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></IconBtn>
                          <IconBtn label="تكرار" disabled={scenes.length >= LIMITS.scenes.max} onClick={() => edit([...scenes.slice(0, i + 1), { ...s, id: newId() }, ...scenes.slice(i + 1)])}><Copy className="size-4" /></IconBtn>
                          <IconBtn label="حذف" disabled={scenes.length <= LIMITS.scenes.min} onClick={() => { edit(scenes.filter((_, k) => k !== i)); setSelected(Math.max(0, i - 1)); }}><Trash2 className="size-4" /></IconBtn>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                        <label className="grid gap-1 text-xs font-bold text-ink-2">
                          النص الكبير على الشاشة
                          <Input value={s.text} maxLength={LIMITS.text} onChange={(e) => patchScene(i, { text: e.target.value })} placeholder="مثال: ب" className="font-display text-base" />
                        </label>
                        <label className="grid gap-1 text-xs font-bold text-ink-2">
                          الجملة المسموعة ({s.narration.length}/{LIMITS.narration})
                          <Textarea value={s.narration} maxLength={LIMITS.narration} onChange={(e) => patchScene(i, { narration: e.target.value })} rows={2} className="min-h-0 text-sm" placeholder="ما يقوله الراوي في هذا المشهد" />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {s.emoji.map((e, k) => (
                          <button key={k} type="button" onClick={() => patchScene(i, { emoji: s.emoji.filter((_, j) => j !== k) })} className="group relative rounded-xl border border-line p-1 hover:border-danger" aria-label="إزالة الرسم">
                            <Emoji e={e} size={36} />
                            <X className="absolute -top-1.5 -end-1.5 size-4 rounded-full bg-danger text-white p-0.5 opacity-0 group-hover:opacity-100" aria-hidden />
                          </button>
                        ))}
                        {s.emoji.length < LIMITS.emoji ? <Button variant="ghost" className="h-10" onClick={() => setPicker(i)} icon={<Plus className="size-4" />}>رسم</Button> : null}
                      </div>
                      {voiced && s.narration.trim() ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
                          {a && fresh(s) ? (
                            <>
                              <Badge tone="ok">صوت {a.source === "ai" ? "ذكي" : "مسجّل"} · {fmtSec(a.durationMs)}</Badge>
                              <audio src={a.url} controls preload="none" className="h-8 max-w-56" />
                            </>
                          ) : a ? (
                            <Badge tone="warn">الصوت لا يطابق الجملة بعد تعديلها</Badge>
                          ) : (
                            <Badge>بلا صوت</Badge>
                          )}
                          {p.voiceMode === "recorded" ? (
                            <div className="ms-auto">
                              <Recorder
                                url={`/api/projects/${id}/scenes/${s.id}/audio`}
                                disabled={saveState !== "saved"}
                                onDone={(d) => setData(d as ProjectPayload)}
                                onError={setActionError}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
              {scenes.length < LIMITS.scenes.max ? (
                <Button variant="secondary" onClick={() => { edit([...scenes, { id: newId(), narration: "", text: "", emoji: [], bg: BACKGROUNDS[scenes.length % BACKGROUNDS.length] }]); setSelected(scenes.length); }} icon={<Plus className="size-4" />}>
                  أضف مشهدًا
                </Button>
              ) : null}
            </div>
          </div>

          {/* ───── الصوت والتصدير والنشر ───── */}
          <div className="grid gap-6 lg:grid-cols-2 items-start">
            <div className="grid gap-6">
              <Card>
                <h2 className="font-display text-lg mb-4">الصوت والموسيقى</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm font-bold">
                    التعليق الصوتي
                    <Select value={p.voiceMode} onChange={(e) => saveSettings({ voiceMode: e.target.value as VoiceMode })} options={(Object.keys(VOICE_MODES) as VoiceMode[]).map((v) => ({ value: v, label: VOICE_MODES[v] + (v === "ai" && !data.services.voice ? " (غير متصل)" : "") }))} />
                  </label>
                  <label className="grid gap-1 text-sm font-bold">
                    الموسيقى
                    <Select value={p.music} onChange={(e) => saveSettings({ music: e.target.value as Music })} options={(Object.keys(MUSIC) as Music[]).map((m) => ({ value: m, label: MUSIC[m] }))} />
                  </label>
                </div>
                {p.voiceMode === "ai" ? (
                  <div className="mt-4 grid gap-3">
                    {!data.services.voice ? <Notice tone="warn">الصوت الذكي غير متصل على الخادم. اختر «تسجيل صوتي» أو «بدون تعليق».</Notice> : null}
                    <p className="text-sm text-ink-2">{missing ? `${missing} من المشاهد تحتاج صوتًا.` : "كل المشاهد لها صوت مطابق."}</p>
                    <JobStatus job={jobOf("speech")} onChange={reload} />
                    <div><Button onClick={() => run("speech")} disabled={!missing || !data.services.voice || isActive(jobOf("speech")) || saveState !== "saved"} icon={<Sparkles className="size-4" />}>ولّد الصوت</Button></div>
                  </div>
                ) : p.voiceMode === "recorded" ? (
                  <p className="mt-4 text-sm text-ink-2">سجّل جملة كل مشهد من بطاقته أعلاه (حتى 11 ثانية). {missing ? `باقي ${missing} مشاهد.` : "اكتمل التسجيل."}</p>
                ) : (
                  <p className="mt-4 text-sm text-ink-2">تظهر الجمل كنص على الشاشة مع الموسيقى، دون صوت راوٍ.</p>
                )}
              </Card>
              <Card>
                <h2 className="font-display text-lg mb-4">التصدير</h2>
                {data.issues.length && saveState === "saved" ? (
                  <ul className="mb-4 grid gap-1 text-sm text-amber list-disc ps-5">{data.issues.map((x) => <li key={x}>{x}</li>)}</ul>
                ) : null}
                <JobStatus job={jobOf("render")} onChange={reload} />
                <div className="mt-3">
                  <Button onClick={() => run("render")} disabled={isActive(jobOf("render")) || saveState !== "saved" || data.issues.length > 0} icon={<Film className="size-4" />}>
                    {render ? "صدّر من جديد" : "صدّر الفيديو"}
                  </Button>
                </div>
                {render ? (
                  <div className="mt-5 flex flex-wrap gap-4 items-start">
                    <video key={render.id} src={render.video} poster={render.thumb} controls playsInline className="w-44 aspect-[9/16] rounded-2xl bg-ink" />
                    <div className="text-sm grid gap-1.5">
                      {outdated ? <Badge tone="warn">عدّلت المقطع بعد هذا التصدير</Badge> : <Badge tone="ok">آخر نسخة</Badge>}
                      <span className="text-muted">{fmtSec(render.durationMs)} · {fmtBytes(render.sizeBytes)}</span>
                      <span className="text-muted">{fmtDate(render.createdAt)}</span>
                      <a href={`${render.video}?download=1`} className="inline-flex items-center gap-1 font-bold text-accent"><Download className="size-4" aria-hidden /> تنزيل MP4</a>
                    </div>
                  </div>
                ) : null}
              </Card>
            </div>
            <PublishPanel key={render?.id ?? "none"} data={data} onChange={(d) => (d ? setData(d) : void reload())} />
          </div>
        </>
      )}
      <EmojiPicker open={picker !== null} onClose={() => setPicker(null)} onPick={(e) => picker !== null && patchScene(picker, { emoji: [...scenes[picker].emoji, e] })} />
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} disabled={disabled} aria-label={label} title={label} className="rounded-lg p-1.5 text-ink-2 hover:bg-surface-2 disabled:opacity-30">
      {children}
    </button>
  );
}
