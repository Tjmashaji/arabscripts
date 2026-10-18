"use client";
import { Mic2, Play, RefreshCw, Upload, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AssetThumb } from "@/components/asset-thumb";
import { JobStatus } from "@/components/job-status";
import { useProject, type Scene } from "@/components/project-context";
import { Badge, Button, Card, Field, LinkButton, Notice, Select, SimBadge } from "@/components/ui";
import { useScenes } from "@/components/use-scenes";
import { VOICE_TONES } from "@/lib/domain";
import { api, ApiError, fmtSec, newKey, useData } from "@/lib/client";
import { sceneStarts } from "@/lib/timing";

type Catalog = { provider: { id: string; label: string; mode: "live" | "simulation"; free?: boolean } | null; voices: { id: string; name: string; gender: string; note?: string; previewUrl?: string }[]; dialects: string[] };
type Caps = { capabilities: { capability: string; state: "live" | "simulation" | "unavailable"; provider: string; setup?: string }[] };

function SceneProduction({ scene, start, canEdit }: { scene: Scene; start: number; canEdit: boolean }) {
  const { data, reload } = useProject();
  const { patch } = useScenes();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pid = data!.project.id;
  const media = data!.assets.filter((a) => (a.kind === "image" || a.kind === "video") && a.role !== "logo");
  const selected = data!.assets.find((a) => a.id === scene.selected_asset_id);
  const job = data!.jobs.find((j) => (j.type === "generate_video" || j.type === "generate_image") && j.input.scene_id === scene.id);
  const refs = data!.assets.filter((a) => a.kind === "image" || a.kind === "video");
  async function generate(kind: "video" | "image") {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${pid}/scenes/${scene.id}/generate`, { body: { kind, idempotency_key: newKey(`gen-${scene.id}`) } });
      await reload();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="grid gap-4 md:grid-cols-[220px_1fr]">
      <div>
        {selected ? <AssetThumb asset={selected} controls className="aspect-[9/12]" /> : <div className="aspect-[9/12] rounded-xl border-2 border-dashed border-line grid place-items-center text-sm text-muted p-4 text-center">لم تُحدد مادة لهذا المشهد بعد</div>}
      </div>
      <div className="flex flex-col gap-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-ink text-white text-xs font-bold">{scene.position + 1}</span>
          <h3 className="font-bold">{scene.title}</h3>
          <span className="text-xs text-muted"><span className="ltr">{(start / 1000).toFixed(1)}–{((start + scene.duration_ms) / 1000).toFixed(1)}</span> ث</span>
          {scene.source_type === "generate" ? <Badge tone="accent">مولّد</Badge> : scene.source_type === "upload" ? <Badge tone="info">مادة حقيقية</Badge> : null}
        </div>
        <p className="text-sm text-ink-2 line-clamp-2 ltr text-start" dir="ltr">{scene.visual_prompt || "—"}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="استخدم مادة من مكتبتك" htmlFor={`sel-${scene.id}`}>
            <Select id={`sel-${scene.id}`} disabled={!canEdit} value={scene.selected_asset_id ?? ""} onChange={(e) => void patch(scene, { selected_asset_id: e.target.value || null, source_type: e.target.value ? (data!.assets.find((a) => a.id === e.target.value)?.role === "generated" ? "generate" : "upload") : "none", trim_start_ms: 0 })}
              options={[{ value: "", label: "— بدون —" }, ...media.map((a) => ({ value: a.id, label: `${a.kind === "video" ? "🎬" : "🖼"} ${a.original_name}${a.is_simulated ? " (محاكاة)" : ""}` }))]} />
          </Field>
          {selected?.kind === "video" ? (
            <Field label="ابدأ المقطع من الثانية" htmlFor={`trim-${scene.id}`} hint={`طول المقطع ${fmtSec(selected.duration_ms)}`}>
              <input id={`trim-${scene.id}`} type="number" min={0} step={0.5} max={Math.max(0, ((selected.duration_ms ?? 0) - 500) / 1000)} defaultValue={scene.trim_start_ms / 1000} disabled={!canEdit} className="h-11 rounded-xl border border-line bg-surface px-3 ltr text-end" onBlur={(e) => { const ms = Math.round(Number(e.target.value) * 1000); if (ms !== scene.trim_start_ms) void patch(scene, { trim_start_ms: ms }); }} />
            </Field>
          ) : (
            <Field label="صورة مرجعية للتوليد" htmlFor={`ref-${scene.id}`} hint="تُرسل للمزود إذا كان يدعم الصور المرجعية">
              <Select id={`ref-${scene.id}`} disabled={!canEdit} value={scene.reference_asset_ids[0] ?? ""} onChange={(e) => void patch(scene, { reference_asset_ids: e.target.value ? [e.target.value] : [] })} options={[{ value: "", label: "— بدون —" }, ...refs.map((a) => ({ value: a.id, label: a.original_name }))]} />
            </Field>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="h-9 text-sm" onClick={() => generate("video")} loading={busy} disabled={!canEdit || job?.status === "queued" || job?.status === "processing"} icon={<Wand2 className="size-4" />}>{job ? "أعد توليد الفيديو" : "ولّد فيديو للمشهد"}</Button>
          <Button variant="ghost" className="h-9 text-sm" onClick={() => generate("image")} disabled={!canEdit || busy} icon={<Wand2 className="size-4" />}>ولّد صورة</Button>
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {job ? <JobStatus job={job} onChange={reload} /> : null}
      </div>
    </Card>
  );
}

function Voiceover({ canEdit }: { canEdit: boolean }) {
  const { data, reload } = useProject();
  const { data: catalog, error: catErr } = useData<Catalog>("/api/voices/catalog");
  const [voice, setVoice] = useState("");
  const [speed, setSpeed] = useState(1);
  const [tone, setTone] = useState(data!.project.settings.voice_tone);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pid = data!.project.id;
  const voices = useMemo(() => {
    const g = data!.project.settings.voice_gender;
    return [...(catalog?.voices ?? [])].sort((a, b) => Number(b.gender === g) - Number(a.gender === g));
  }, [catalog, data]);
  const chosen = voice || voices[0]?.id || "";
  const recordings = data!.assets.filter((a) => a.kind === "audio" && a.role === "voice");

  async function gen(sceneIds?: string[]) {
    setBusy(sceneIds?.[0] ?? "all");
    setError(null);
    try {
      await api(`/api/projects/${pid}/voiceover`, { body: { action: "generate", voice_id: chosen, speed, tone, scene_ids: sceneIds, idempotency_key: newKey("tts") } });
      await reload();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }
  async function attach(assetId: string, sceneId: string | null) {
    try {
      const s = data!.scenes.find((x) => x.id === sceneId);
      await api(`/api/projects/${pid}/voiceover`, { body: { action: "attach", asset_id: assetId, scene_id: sceneId, text: s?.voiceover ?? "" } });
      await reload();
    } catch (e) {
      setError((e as ApiError).message);
    }
  }
  async function preview() {
    setError(null);
    try {
      const res = await fetch("/api/voices/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice_id: chosen }) });
      if (!res.ok) throw new ApiError(res.status, "error", (await res.json()).error?.message ?? "تعذّرت المعاينة");
      const url = res.headers.get("content-type")?.startsWith("audio") ? URL.createObjectURL(await res.blob()) : (await res.json()).url;
      void new Audio(url).play();
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Mic2 className="size-5 text-accent" aria-hidden />
        <h2 className="font-display text-lg">التعليق الصوتي</h2>
        {catalog?.provider ? <Badge tone={catalog.provider.mode === "live" ? "ok" : "warn"}>{catalog.provider.label}</Badge> : null}
      </div>
      {catErr ? <Notice tone="danger">{catErr.message}</Notice> : null}
      {catalog && !catalog.provider ? <Notice tone="warn" title="خدمة الصوت غير متصلة">أضف مفتاح ElevenLabs من إعدادات الخادم، أو ارفع تسجيلك الصوتي من صفحة المواد واربطه بالمشاهد أدناه.</Notice> : null}
      {catalog?.provider?.free ? <div className="mb-4"><Notice tone="info">صوت مجاني من أصوات Microsoft عبر خدمة غير رسمية: قد تتوقف دون إشعار، وشروط استخدامها التجاري غير محددة. للإعلانات التجارية المنشورة يُفضَّل ElevenLabs.</Notice></div> : null}
      {catalog?.provider?.mode === "simulation" ? <div className="mb-4"><Notice tone="warn">وضع المحاكاة يولّد نغمات بطول الجملة لاختبار التوقيت فقط، وليس صوتًا بشريًا.</Notice></div> : null}
      {catalog?.provider ? (
        <div className="grid gap-3 sm:grid-cols-4 items-end">
          <Field label="الصوت" htmlFor="voice"><Select id="voice" value={chosen} onChange={(e) => setVoice(e.target.value)} options={voices.map((v) => ({ value: v.id, label: `${v.name}${v.note ? ` — ${v.note}` : ""}` }))} /></Field>
          <Field label={`السرعة ${speed.toFixed(2)}×`} htmlFor="speed"><input id="speed" type="range" min={0.7} max={1.3} step={0.05} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="h-11" /></Field>
          <Field label="النبرة" htmlFor="tn"><Select id="tn" value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} options={VOICE_TONES.list} /></Field>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={preview} icon={<Play className="size-4" />} disabled={!chosen}>معاينة</Button>
            <Button onClick={() => gen()} loading={busy === "all"} disabled={!canEdit || !chosen}>ولّد للكل</Button>
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted mt-2">اللهجة في الصوت الناتج تعتمد على الصوت المختار لدى المزود؛ استمع للمعاينة قبل التوليد.</p>
      {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}
      <ul className="mt-5 flex flex-col divide-y divide-line">
        {data!.scenes.map((s) => {
          const a = data!.audio.find((x) => x.scene_id === s.id && x.kind === "voiceover");
          const job = data!.jobs.find((j) => j.type === "generate_speech" && j.input.audio_id === a?.id);
          return (
            <li key={s.id} className="py-3 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <p className="text-sm"><span className="font-bold">{s.position + 1}. </span>{s.voiceover || <span className="text-muted">بلا نص تعليق</span>}</p>
                {a?.status === "ready" && a.url ? <audio src={a.url} controls preload="none" className="mt-2 h-9 w-full max-w-md" /> : null}
                {a?.is_simulated ? <SimBadge className="mt-1" /> : null}
                {job && job.status !== "completed" ? <div className="mt-2 max-w-md"><JobStatus job={job} onChange={reload} compact /></div> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {catalog?.provider && s.voiceover.trim() ? <Button variant="secondary" className="h-9 text-xs" onClick={() => gen([s.id])} loading={busy === s.id} disabled={!canEdit} icon={<RefreshCw className="size-3.5" />}>{a ? "أعد هذه الجملة" : "ولّد"}</Button> : null}
                {recordings.length ? (
                  <Select aria-label="ربط تسجيل صوتي" className="h-9 text-xs w-44" value="" onChange={(e) => e.target.value && attach(e.target.value, s.id)} options={[{ value: "", label: "ربط تسجيل مرفوع…" }, ...recordings.map((r) => ({ value: r.id, label: r.original_name }))]} disabled={!canEdit} />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {!recordings.length ? <p className="text-xs text-muted mt-3 flex items-center gap-1"><Upload className="size-3.5" aria-hidden /> لديك تسجيل جاهز؟ ارفعه من صفحة المواد بنوع «تسجيل صوتي» ثم اربطه بالمشهد.</p> : null}
    </Card>
  );
}

export default function Produce() {
  const { data } = useProject();
  const { data: caps } = useData<Caps>("/api/settings/providers");
  if (!data) return null;
  const canEdit = data.workspace.role !== "viewer";
  const video = caps?.capabilities.find((c) => c.capability === "video");
  const starts = sceneStarts(data.scenes.map((s) => s.duration_ms));
  return (
    <div className="flex flex-col gap-6">
      {video?.state === "simulation" ? <Notice tone="warn" title="توليد الفيديو في وضع المحاكاة">المشاهد المولّدة الآن مقاطع اختبار موسومة «محاكاة» وليست نتيجة إنتاج. استخدم موادك الحقيقية، أو أضف مفتاح Runway لتوليد حقيقي.</Notice> : video?.state === "unavailable" ? <Notice tone="warn">توليد الفيديو غير متصل. يمكنك استخدام مقاطعك وصورك المرفوعة.</Notice> : null}
      {!data.scenes.length ? <Notice tone="info">أنشئ المشاهد أولًا من خطوة السيناريو.</Notice> : null}
      <section className="flex flex-col gap-4" aria-label="مشاهد الإعلان">
        {data.scenes.map((s, i) => <SceneProduction key={s.id} scene={s} start={starts[i]} canEdit={canEdit} />)}
      </section>
      <Voiceover canEdit={canEdit} />
      <div className="flex justify-end"><LinkButton href={`/projects/${data.project.id}/editor`}>التالي: المونتاج</LinkButton></div>
    </div>
  );
}
