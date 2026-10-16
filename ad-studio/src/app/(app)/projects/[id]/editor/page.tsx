"use client";
import { Check, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useProject, type Bundle } from "@/components/project-context";
import { SceneList } from "@/components/scene-list";
import { SequencePlayer } from "@/components/sequence-player";
import { Card, ChoiceGroup, Field, LinkButton, Notice, Select, Tabs, Toggle, cx } from "@/components/ui";
import { useScenes } from "@/components/use-scenes";
import { ASPECTS, TRANSITIONS, type TimelineData } from "@/lib/domain";
import { api, ApiError } from "@/lib/client";
import { sceneStarts } from "@/lib/timing";

// خط زمني مرئي: مسار الفيديو والتعليق والموسيقى والنصوص بعرض يتناسب مع المدة
function Timeline({ data }: { data: Bundle }) {
  const total = Math.max(1, data.scenes.reduce((a, s) => a + s.duration_ms, 0));
  const list = sceneStarts(data.scenes.map((s) => s.duration_ms));
  const starts = new Map(data.scenes.map((s, i) => [s.id, list[i]]));
  const pct = (ms: number) => `${(ms / total) * 100}%`;
  const track = "relative h-9 rounded-lg bg-surface-2 overflow-hidden";
  const voices = data.audio.filter((a) => a.kind === "voiceover");
  return (
    <div className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-xs" dir="rtl">
      <span className="self-center font-bold text-ink-2">الفيديو</span>
      <div className={track}>
        {data.scenes.map((s) => (
          <div key={s.id} className={cx("absolute inset-y-0 border-s-2 border-paper px-1.5 flex items-center truncate", s.selected_asset_id ? "bg-ink text-white" : "bg-danger-soft text-danger")} style={{ insetInlineStart: pct(starts.get(s.id)!), width: pct(s.duration_ms) }} title={s.title}>
            {s.position + 1}. {s.title}
          </div>
        ))}
      </div>
      <span className="self-center font-bold text-ink-2">التعليق</span>
      <div className={track}>
        {voices.map((v) => {
          const st = (starts.get(v.scene_id ?? "") ?? 0) + v.offset_ms;
          return <div key={v.id} className={cx("absolute inset-y-1 rounded-md", v.status === "ready" ? "bg-accent" : v.status === "failed" ? "bg-danger" : "bg-accent/40 animate-pulse")} style={{ insetInlineStart: pct(st), width: pct(v.asset_duration_ms ?? 2000) }} title={v.text} />;
        })}
      </div>
      <span className="self-center font-bold text-ink-2">الموسيقى</span>
      <div className={track}>{data.timeline.data.music_asset_id ? <div className="absolute inset-y-1 inset-x-0 rounded-md bg-teal/60" /> : <span className="absolute inset-0 grid place-items-center text-muted">بدون موسيقى</span>}</div>
      <span className="self-center font-bold text-ink-2">النصوص</span>
      <div className={track}>
        {data.scenes.filter((s) => s.on_screen_text).map((s) => <div key={s.id} className="absolute inset-y-1 rounded-md bg-amber/60 px-1 truncate text-[10px] leading-7 text-white" style={{ insetInlineStart: pct(starts.get(s.id)!), width: pct(s.duration_ms) }}>{s.on_screen_text}</div>)}
      </div>
    </div>
  );
}

export default function Editor() {
  const { data, setData, reload } = useProject();
  const { patch, reorder, error: sceneError } = useScenes();
  const [tab, setTab] = useState<"scenes" | "audio" | "text" | "logo">("scenes");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<TimelineData | null>(null);

  // حفظ تلقائي بعد توقف التعديل بـ 700 ملّي ثانية، مع قفل تفاؤلي بالنسخة
  async function flush() {
    if (!pending.current || !data) return;
    const next = pending.current;
    pending.current = null;
    setState("saving");
    try {
      const r = await api<{ version: number; data: TimelineData }>(`/api/projects/${data.project.id}/timeline`, { method: "PATCH", body: { data: next, version: data.timeline.version } });
      setData({ ...data, timeline: r });
      setState("saved");
    } catch (e) {
      setState("error");
      setError((e as ApiError).message);
      if ((e as ApiError).code === "conflict") await reload();
    }
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!data) return null;
  const tl = data.timeline.data;
  const canEdit = data.workspace.role !== "viewer";
  function update(changes: Partial<TimelineData>) {
    const next = { ...tl, ...changes };
    setData({ ...data!, timeline: { ...data!.timeline, data: next } });
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  }
  const music = data.assets.filter((a) => a.kind === "audio" && a.role === "music");
  const images = data.assets.filter((a) => a.kind === "image");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card className="self-start">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg">المعاينة</h2>
            <span className="text-xs text-muted flex items-center gap-1" role="status">
              {state === "saving" ? <><Loader2 className="size-3 animate-spin" aria-hidden /> يحفظ…</> : state === "saved" ? <><Check className="size-3 text-ok" aria-hidden /> حُفظ تلقائيًا</> : null}
            </span>
          </div>
          <SequencePlayer data={data} />
          <p className="text-xs text-muted mt-3">معاينة تقريبية في المتصفح. للمعاينة الدقيقة بالانتقالات والخطوط النهائية استخدم <Link className="text-accent font-bold" href={`/projects/${data.project.id}/preview`}>المعاينة المصدّرة</Link>.</p>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <Tabs value={tab} onChange={setTab} tabs={[{ value: "scenes", label: "المشاهد" }, { value: "audio", label: "الصوت" }, { value: "text", label: "النصوص" }, { value: "logo", label: "الشعار والمقاس" }]} />
          </div>
          {error || sceneError ? <div className="mb-4"><Notice tone="danger">{error ?? sceneError}</Notice></div> : null}

          {tab === "scenes" ? (
            <SceneList scenes={data.scenes} onReorder={reorder} disabled={!canEdit} render={(s) => {
              const a = data.assets.find((x) => x.id === s.selected_asset_id);
              return (
                <div className="rounded-xl border border-line p-3 grid gap-3 sm:grid-cols-[1fr_110px_150px_auto] sm:items-end">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{s.position + 1}. {s.title}</p>
                    <p className="text-xs text-muted truncate">{a ? a.original_name : "بلا مادة"}</p>
                  </div>
                  <Field label="المدة (ث)" htmlFor={`ed-${s.id}`}><input id={`ed-${s.id}`} type="number" min={0.5} max={60} step={0.5} defaultValue={s.duration_ms / 1000} disabled={!canEdit} className="h-10 rounded-lg border border-line px-2 ltr text-end" onBlur={(e) => { const ms = Math.round(Number(e.target.value) * 1000); if (ms >= 500 && ms !== s.duration_ms) void patch(s, { duration_ms: ms }); }} /></Field>
                  <Field label="الانتقال" htmlFor={`tr-${s.id}`}><Select id={`tr-${s.id}`} className="h-10" value={s.transition} disabled={!canEdit} onChange={(e) => void patch(s, { transition: e.target.value })} options={TRANSITIONS.list} /></Field>
                  <Link href={`/projects/${data.project.id}/produce`} className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-xs font-bold text-ink-2 hover:bg-surface-2"><RefreshCw className="size-3.5" aria-hidden /> استبدال / إعادة توليد</Link>
                </div>
              );
            }} />
          ) : null}

          {tab === "audio" ? (
            <div className="grid gap-5">
              <Field label={`مستوى التعليق الصوتي ${Math.round(tl.voice_volume * 100)}%`} htmlFor="vv"><input id="vv" type="range" min={0} max={2} step={0.05} value={tl.voice_volume} disabled={!canEdit} onChange={(e) => update({ voice_volume: Number(e.target.value) })} /></Field>
              <Field label="الموسيقى" htmlFor="mu" hint={!music.length ? "ارفع موسيقى مرخّصة من صفحة المواد بنوع «موسيقى»." : undefined}>
                <Select id="mu" value={tl.music_asset_id ?? ""} disabled={!canEdit} onChange={(e) => update({ music_asset_id: e.target.value || null })} options={[{ value: "", label: "بدون موسيقى" }, ...music.map((m) => ({ value: m.id, label: m.original_name }))]} />
              </Field>
              <Field label={`مستوى الموسيقى ${Math.round(tl.music_volume * 100)}%`} htmlFor="mv"><input id="mv" type="range" min={0} max={1} step={0.05} value={tl.music_volume} disabled={!canEdit || !tl.music_asset_id} onChange={(e) => update({ music_volume: Number(e.target.value) })} /></Field>
              <Toggle checked={tl.duck_music} onChange={(v) => canEdit && update({ duck_music: v })} label="خفض الموسيقى تلقائيًا أثناء التعليق" />
              <Field label={`صوت المقاطع الأصلي ${Math.round(tl.scene_volume * 100)}%`} htmlFor="sv" hint="الصوت المسجّل داخل مقاطع الفيديو نفسها"><input id="sv" type="range" min={0} max={1} step={0.05} value={tl.scene_volume} disabled={!canEdit} onChange={(e) => update({ scene_volume: Number(e.target.value) })} /></Field>
            </div>
          ) : null}

          {tab === "text" ? (
            <div className="grid gap-5">
              <Toggle checked={tl.subtitles} onChange={(v) => canEdit && update({ subtitles: v })} label="إظهار ترجمة التعليق الصوتي" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="الخط" htmlFor="fn"><Select id="fn" value={tl.text_style.font} disabled={!canEdit} onChange={(e) => update({ text_style: { ...tl.text_style, font: e.target.value as TimelineData["text_style"]["font"] } })} options={[{ value: "IBM Plex Sans Arabic", label: "IBM Plex Sans Arabic" }, { value: "Noto Kufi Arabic", label: "Noto Kufi Arabic (كوفي)" }]} /></Field>
                <Field label="اللون" htmlFor="cl"><input id="cl" type="color" value={tl.text_style.color} disabled={!canEdit} onChange={(e) => update({ text_style: { ...tl.text_style, color: e.target.value.toUpperCase() } })} className="h-11 w-full rounded-xl border border-line" /></Field>
                <Field label={`الحجم ${tl.text_style.size}`} htmlFor="sz"><input id="sz" type="range" min={28} max={110} value={tl.text_style.size} disabled={!canEdit} onChange={(e) => update({ text_style: { ...tl.text_style, size: Number(e.target.value) } })} /></Field>
                <Toggle checked={tl.text_style.box} onChange={(v) => canEdit && update({ text_style: { ...tl.text_style, box: v } })} label="خلفية خلف النص" />
              </div>
              <ChoiceGroup label="موضع الترجمة" value={tl.text_style.position} onChange={(v) => canEdit && update({ text_style: { ...tl.text_style, position: v } })} options={[{ value: "top", label: "أعلى" }, { value: "center", label: "وسط" }, { value: "bottom", label: "أسفل" }]} />
              <p className="text-xs text-muted">النص على الشاشة لكل مشهد يُعدَّل من صفحة السيناريو والمشاهد.</p>
            </div>
          ) : null}

          {tab === "logo" ? (
            <div className="grid gap-5">
              <Field label="الشعار" htmlFor="lg" hint={!images.length ? "ارفع الشعار من صفحة المواد." : undefined}>
                <Select id="lg" value={tl.logo.asset_id ?? ""} disabled={!canEdit} onChange={(e) => update({ logo: { ...tl.logo, asset_id: e.target.value || null } })} options={[{ value: "", label: "بدون شعار" }, ...images.map((m) => ({ value: m.id, label: `${m.role === "logo" ? "★ " : ""}${m.original_name}` }))]} />
              </Field>
              <ChoiceGroup label="موضع الشعار" value={tl.logo.position} onChange={(v) => canEdit && update({ logo: { ...tl.logo, position: v } })} columns={2} options={[{ value: "top-right", label: "أعلى اليمين" }, { value: "top-left", label: "أعلى اليسار" }, { value: "bottom-right", label: "أسفل اليمين" }, { value: "bottom-left", label: "أسفل اليسار" }]} />
              <Field label={`حجم الشعار ${Math.round(tl.logo.scale * 100)}% من العرض`} htmlFor="ls"><input id="ls" type="range" min={0.06} max={0.4} step={0.01} value={tl.logo.scale} disabled={!canEdit} onChange={(e) => update({ logo: { ...tl.logo, scale: Number(e.target.value) } })} /></Field>
              <ChoiceGroup label="مقاس الفيديو" value={tl.aspect} onChange={(v) => canEdit && update({ aspect: v })} columns={4} options={ASPECTS.map((a) => ({ value: a, label: a, hint: a === "9:16" ? "ريلز/تيك توك" : a === "16:9" ? "يوتيوب" : a === "1:1" ? "مربع" : "إنستغرام" }))} />
            </div>
          ) : null}
        </Card>
      </div>
      <Card>
        <h2 className="font-display text-lg mb-4">الخط الزمني</h2>
        <Timeline data={data} />
      </Card>
      <div className="flex justify-end gap-2"><LinkButton variant="secondary" href={`/projects/${data.project.id}/preview`}>المعاينة</LinkButton><LinkButton href={`/projects/${data.project.id}/export`}>التصدير</LinkButton></div>
    </div>
  );
}
