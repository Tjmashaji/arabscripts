"use client";
import { FileVideo } from "lucide-react";
import { useState } from "react";
import { ExportList } from "@/components/export-list";
import { JobStatus } from "@/components/job-status";
import { useProject } from "@/components/project-context";
import { Badge, Button, Card, ChoiceGroup, Notice, Spinner } from "@/components/ui";
import { ASPECTS, type Aspect } from "@/lib/domain";
import { api, ApiError, fmtSec, newKey, useData } from "@/lib/client";

type Check = { problems: { message: string; position?: number }[]; scenes: number; voice: number; music: boolean; logo: boolean; simulation: boolean; total_ms: number };

export default function ExportPage() {
  const { data, reload, setData } = useProject();
  const { data: check, loading, reload: recheck } = useData<Check>(data ? `/api/projects/${data.project.id}/export/check` : null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const job = data.jobs.find((j) => j.type === "export" && j.input.quality !== "preview");
  async function setAspect(a: Aspect) {
    const r = await api<{ version: number; data: import("@/lib/domain").TimelineData }>(`/api/projects/${data!.project.id}/timeline`, { method: "PATCH", body: { data: { ...data!.timeline.data, aspect: a }, version: data!.timeline.version } });
    setData({ ...data!, timeline: r });
  }
  async function run() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${data!.project.id}/export`, { body: { quality: "final", idempotency_key: newKey("export") } });
      await reload();
    } catch (e) {
      setError(e as ApiError);
      void recheck();
    } finally {
      setBusy(false);
    }
  }
  const ready = check && !check.problems.length;
  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="self-start">
        <h2 className="font-display text-lg mb-4">تصدير الفيديو النهائي</h2>
        <ChoiceGroup label="المقاس" value={data.timeline.data.aspect} onChange={(a) => data.workspace.role !== "viewer" && void setAspect(a)} columns={2} options={ASPECTS.map((a) => ({ value: a, label: a, hint: a === "9:16" ? "TikTok · Reels · Snap · Shorts" : a === "16:9" ? "YouTube · موقع" : a === "1:1" ? "منشور مربع" : "Instagram Feed" }))} />
        <div className="mt-5">
          {loading ? <Spinner label="يفحص الجاهزية…" /> : check ? (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge>{check.scenes} مشاهد</Badge><Badge>{fmtSec(check.total_ms)}</Badge><Badge tone={check.voice ? "ok" : "neutral"}>{check.voice} مقاطع تعليق</Badge><Badge tone={check.music ? "ok" : "neutral"}>{check.music ? "موسيقى" : "بلا موسيقى"}</Badge><Badge tone={check.logo ? "ok" : "neutral"}>{check.logo ? "شعار" : "بلا شعار"}</Badge>
              </div>
              {check.problems.length ? <Notice tone="warn" title="يحتاج المشروع إلى:"><ul className="list-disc ps-5">{check.problems.map((p) => <li key={p.message}>{p.message}</li>)}</ul></Notice> : <Notice tone="ok">المشروع جاهز للتصدير.</Notice>}
              {check.simulation ? <Notice tone="warn">يحتوي المشروع على مواد محاكاة، لذلك سيحمل الفيديو وسم «محاكاة — ليست نتيجة إنتاج» ظاهرًا.</Notice> : null}
            </div>
          ) : null}
        </div>
        {error ? <div className="mt-4"><Notice tone="danger" title={error.message}>{Array.isArray(error.details) ? <ul className="list-disc ps-5">{(error.details as { message: string }[]).map((d) => <li key={d.message}>{d.message}</li>)}</ul> : null}</Notice></div> : null}
        <Button className="w-full mt-5" onClick={run} loading={busy} disabled={!ready || data.workspace.role === "viewer" || job?.status === "queued" || job?.status === "processing"} icon={<FileVideo className="size-4" />}>صدّر الفيديو</Button>
        {job ? <div className="mt-4"><JobStatus job={job} onChange={reload} /></div> : null}
      </Card>
      <div>
        <h2 className="font-display text-lg mb-4">الملفات المصدَّرة</h2>
        {data.exports.some((e) => (e.settings_snapshot.quality ?? "final") === "final") ? <ExportList items={data.exports} quality="final" /> : <p className="text-sm text-muted">لا توجد ملفات مصدَّرة بعد. إعدادات المشروع محفوظة، ويمكنك إعادة التصدير بأي مقاس دون إعادة توليد المشاهد.</p>}
      </div>
    </div>
  );
}
