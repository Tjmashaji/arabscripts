"use client";
import { ImagePlus, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { AssetThumb } from "@/components/asset-thumb";
import { useProject, type Asset } from "@/components/project-context";
import { Badge, Button, Card, EmptyState, Field, Input, LinkButton, Modal, Notice, Progress, Select } from "@/components/ui";
import { api, ApiError, fmtBytes, fmtSec, newKey, upload } from "@/lib/client";

const ROLES = [
  { value: "product", label: "صور المنتجات" },
  { value: "place", label: "صور المكان" },
  { value: "logo", label: "الشعار" },
  { value: "other", label: "مواد أخرى" },
  { value: "voice", label: "تسجيل صوتي" },
  { value: "music", label: "موسيقى (مرخّصة)" },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.value, r.label])) as Record<string, string>;
const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a";
const MAX_MB = 200;

type Item = { key: string; name: string; pct: number; error?: string; done?: boolean };

export default function Media() {
  const { data, reload } = useProject();
  const [role, setRole] = useState("product");
  const [items, setItems] = useState<Item[]>([]);
  const [license, setLicense] = useState<{ open: boolean; source: string; ok: boolean; files: File[] }>({ open: false, source: "", ok: false, files: [] });
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  if (!data) return null;
  const pid = data.project.id;
  const canEdit = data.workspace.role !== "viewer";

  async function send(files: File[], extra = "") {
    const list = files.map((f) => ({ key: crypto.randomUUID(), name: f.name, pct: 0 }));
    setItems((x) => [...list, ...x]);
    await Promise.all(
      files.map(async (f, i) => {
        const key = list[i].key;
        const set = (patch: Partial<Item>) => setItems((x) => x.map((it) => (it.key === key ? { ...it, ...patch } : it)));
        if (f.size > MAX_MB * 1024 * 1024) return set({ error: `أكبر من ${MAX_MB} ميغابايت` });
        try {
          await upload(`/api/projects/${pid}/media?role=${role}&name=${encodeURIComponent(f.name)}${extra}`, f, (pct) => set({ pct }));
          set({ pct: 100, done: true });
        } catch (e) {
          set({ error: (e as ApiError).message });
        }
      }),
    );
    void reload();
  }
  function pick(files: FileList | null) {
    if (!files?.length) return;
    const arr = [...files];
    if (role === "music") setLicense({ open: true, source: "", ok: false, files: arr });
    else void send(arr);
  }
  async function remove(a: Asset) {
    if (!confirm(`حذف «${a.original_name}»؟ ستُفصل عن أي مشهد يستخدمها.`)) return;
    setBusy(a.id);
    try {
      await api(`/api/projects/${pid}/media/${a.id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }
  async function analyze(a: Asset) {
    setBusy(a.id);
    try {
      await api(`/api/projects/${pid}/media/${a.id}/analyze`, { body: { idempotency_key: newKey("analyze") } });
      await reload();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }
  const visible = data.assets.filter((a) => a.kind !== "audio" || ["voice", "music", "sfx"].includes(a.role));

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="self-start lg:sticky lg:top-24">
        <h2 className="font-display text-lg mb-1">ارفع موادك</h2>
        <p className="text-sm text-ink-2 mb-4">صور ومقاطع حقيقية من المحل أو المنتج تجعل الإعلان أصدق. يمكنك الرفع من الجوال مباشرة.</p>
        <Field label="نوع المادة" htmlFor="role">
          <Select id="role" value={role} onChange={(e) => setRole(e.target.value)} options={ROLES} disabled={!canEdit} />
        </Field>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (canEdit) pick(e.dataTransfer.files); }}
          className={`mt-4 rounded-2xl border-2 border-dashed p-6 text-center transition ${drag ? "border-accent bg-accent-soft" : "border-line"}`}
        >
          <UploadCloud className="size-8 mx-auto text-muted" aria-hidden />
          <p className="text-sm mt-2">اسحب الملفات هنا أو</p>
          <Button variant="secondary" className="mt-2" onClick={() => input.current?.click()} disabled={!canEdit} icon={<ImagePlus className="size-4" />}>اختر ملفات</Button>
          <input ref={input} type="file" multiple accept={ACCEPT} capture={undefined} className="sr-only" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} aria-label="اختيار ملفات للرفع" />
          <p className="text-xs text-muted mt-3">صور JPG/PNG/WEBP، فيديو MP4/MOV/WEBM، صوت MP3/WAV/M4A. حتى {MAX_MB} م.ب للملف.</p>
        </div>
        {items.length ? (
          <ul className="mt-4 flex flex-col gap-3" aria-live="polite">
            {items.slice(0, 8).map((it) => (
              <li key={it.key} className="text-sm">
                <div className="flex justify-between gap-2"><span className="truncate">{it.name}</span>{it.done ? <Badge tone="ok">تم</Badge> : it.error ? <Badge tone="danger">فشل</Badge> : <span className="text-muted ltr">{it.pct}%</span>}</div>
                {it.error ? <p className="text-xs text-danger mt-1">{it.error}</p> : !it.done ? <Progress value={it.pct} /> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <div className="flex flex-col gap-4">
        {error ? <Notice tone="danger" action={<button className="text-sm font-bold" onClick={() => setError(null)}>إغلاق</button>}>{error}</Notice> : null}
        {!visible.length ? (
          <EmptyState icon={<ImagePlus className="size-7" />} title="لا توجد مواد بعد">ارفع صورة للمكان، وصورًا للمنتجات، ومقطعًا قصيرًا إن وجد. ارفع الشعار أيضًا ليظهر في نهاية الإعلان.</EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((a) => (
              <li key={a.id} className="rounded-2xl border border-line bg-surface overflow-hidden flex flex-col">
                <AssetThumb asset={a} className="aspect-video rounded-none" controls={a.kind !== "image"} />
                <div className="p-3 flex flex-col gap-1.5 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold truncate" title={a.original_name}>{a.original_name}</p>
                    <Badge>{ROLE_LABEL[a.role] ?? (a.role === "generated" ? "مولّد" : a.role)}</Badge>
                  </div>
                  <p className="text-xs text-muted ltr text-end">{a.width ? `${a.width}×${a.height} · ` : ""}{a.duration_ms ? fmtSec(a.duration_ms) + " · " : ""}{fmtBytes(a.size_bytes)}</p>
                  {a.kind !== "audio" ? (
                    a.analysis_status === "done" ? <p className="text-xs text-ink-2 leading-6">{a.analysis?.description}</p>
                    : a.analysis_status === "pending" ? <p className="text-xs text-teal">يُحلَّل الآن…</p>
                    : a.analysis_status === "failed" ? <p className="text-xs text-danger">فشل التحليل.</p>
                    : <p className="text-xs text-muted">لم يُحلَّل (خدمة التحليل غير متصلة). المخرج يعرف اسم الملف ونوعه فقط.</p>
                  ) : null}
                  <div className="mt-auto flex gap-1 pt-2">
                    {a.kind !== "audio" && a.analysis_status !== "pending" ? <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => analyze(a)} loading={busy === a.id} disabled={!canEdit} icon={<RefreshCw className="size-3.5" />}>تحليل</Button> : null}
                    <Button variant="ghost" className="h-8 px-2 text-xs text-danger ms-auto" onClick={() => remove(a)} disabled={!canEdit || busy === a.id} icon={<Trash2 className="size-3.5" />}>حذف</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end"><LinkButton href={`/projects/${pid}/setup`}>التالي: الإعداد والفكرة</LinkButton></div>
      </div>

      <Modal
        open={license.open}
        onClose={() => setLicense((l) => ({ ...l, open: false }))}
        title="ترخيص الموسيقى"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLicense((l) => ({ ...l, open: false }))}>إلغاء</Button>
            <Button disabled={!license.source.trim() || !license.ok} onClick={() => { setLicense((l) => ({ ...l, open: false })); void send(license.files, `&license_source=${encodeURIComponent(license.source)}&commercial_ok=1`); }}>رفع</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Notice tone="warn">ليست كل الموسيقى مجانية للاستخدام التجاري. ارفع فقط ما تملك حق استخدامه في الإعلانات.</Notice>
          <Field label="مصدر الموسيقى" htmlFor="lic" hint="مثال: مكتبة موسيقى مرخّصة، أو من إنتاجك"><Input id="lic" value={license.source} onChange={(e) => setLicense((l) => ({ ...l, source: e.target.value }))} /></Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={license.ok} onChange={(e) => setLicense((l) => ({ ...l, ok: e.target.checked }))} className="mt-1" /> أؤكد أن ترخيص هذه الموسيقى يسمح باستخدامها في إعلانات تجارية.</label>
        </div>
      </Modal>
    </div>
  );
}
