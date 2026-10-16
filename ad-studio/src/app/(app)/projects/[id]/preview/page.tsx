"use client";
import { Clapperboard } from "lucide-react";
import { useState } from "react";
import { ExportList } from "@/components/export-list";
import { JobStatus } from "@/components/job-status";
import { useProject } from "@/components/project-context";
import { SequencePlayer } from "@/components/sequence-player";
import { Button, Card, LinkButton, Notice } from "@/components/ui";
import { api, ApiError, newKey } from "@/lib/client";

export default function Preview() {
  const { data, reload } = useProject();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const job = data.jobs.find((j) => j.type === "export" && j.input.quality === "preview");
  async function render() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${data!.project.id}/export`, { body: { quality: "preview", idempotency_key: newKey("preview") } });
      await reload();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="font-display text-lg mb-1">معاينة سريعة في المتصفح</h2>
        <p className="text-sm text-ink-2 mb-4">تتغير فورًا مع أي تعديل. الانتقالات والخطوط فيها تقريبية.</p>
        <SequencePlayer data={data} />
      </Card>
      <Card>
        <h2 className="font-display text-lg mb-1">معاينة مُصدَّرة</h2>
        <p className="text-sm text-ink-2 mb-4">نسخة بنصف الدقة عبر نفس محرك التصدير، لترى النتيجة النهائية بدقة قبل التصدير الكامل.</p>
        <Button onClick={render} loading={busy} disabled={data.workspace.role === "viewer" || job?.status === "queued" || job?.status === "processing"} icon={<Clapperboard className="size-4" />}>أنشئ معاينة مُصدَّرة</Button>
        {error ? (
          <div className="mt-4"><Notice tone="danger" title={error.message}>{Array.isArray(error.details) ? <ul className="list-disc ps-5">{(error.details as { message: string }[]).map((d) => <li key={d.message}>{d.message}</li>)}</ul> : null}</Notice></div>
        ) : null}
        {job ? <div className="mt-4"><JobStatus job={job} onChange={reload} /></div> : null}
        <div className="mt-4"><ExportList items={data.exports} quality="preview" /></div>
        <div className="mt-5 flex justify-end"><LinkButton href={`/projects/${data.project.id}/export`}>التالي: التصدير</LinkButton></div>
      </Card>
    </div>
  );
}
