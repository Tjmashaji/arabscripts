"use client";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import { PRIVACY, type Privacy, type YoutubeMeta } from "@/lib/domain";
import type { ProjectPayload } from "@/server/services/payload";
import { isActive, JobStatus } from "./job-status";
import { YoutubeIcon } from "./logo";
import { Badge, Button, Card, ChoiceGroup, Field, Input, Notice, Textarea } from "./ui";

export function PublishPanel({ data, onChange }: { data: ProjectPayload; onChange: (d?: ProjectPayload) => void }) {
  const render = data.renders[0];
  const job = data.jobs.find((j) => j.kind === "upload");
  const [meta, setMeta] = useState<YoutubeMeta>(data.project.youtube);
  const [tags, setTags] = useState(data.project.youtube.tags.join("، "));
  const [privacy, setPrivacy] = useState<Privacy>("private");
  const [schedule, setSchedule] = useState("");
  const [kids, setKids] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/projects/${data.project.id}/publish`, {
        body: {
          renderId: render!.id,
          youtube: { ...meta, tags: tags.split(/[،,]/).map((t) => t.trim()).filter(Boolean) },
          privacy,
          publishAt: schedule ? new Date(schedule).toISOString() : null,
          confirmKids: kids,
        },
      });
      onChange();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-display text-lg mb-4 flex items-center gap-2"><YoutubeIcon className="size-5 text-yt" /> النشر على يوتيوب</h2>
      {!render ? (
        <p className="text-sm text-muted">صدّر الفيديو أولًا، ثم انشره من هنا.</p>
      ) : !data.channel ? (
        <Notice tone="info" action={<Link href="/settings" className="font-bold text-accent text-sm self-center">ربط القناة</Link>}>اربط قناتك على يوتيوب لتنشر مباشرة. ويمكنك تنزيل الفيديو ورفعه يدويًا.</Notice>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm text-ink-2">سيُرفع إلى قناة <b>{data.channel.title}</b>.</p>
          <Field label={`العنوان (${meta.title.length}/100)`} htmlFor="yt-title" hint="#Shorts في العنوان أو الوصف يساعد يوتيوب على تصنيفه كشورت.">
            <Input id="yt-title" value={meta.title} maxLength={100} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
          </Field>
          <Field label="الوصف" htmlFor="yt-desc">
            <Textarea id="yt-desc" value={meta.description} maxLength={5000} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
          </Field>
          <Field label="الوسوم" htmlFor="yt-tags" hint="افصل بينها بفاصلة.">
            <Input id="yt-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </Field>
          <ChoiceGroup label="الظهور" value={privacy} onChange={setPrivacy} options={(Object.keys(PRIVACY) as Privacy[]).map((p) => ({ value: p, label: PRIVACY[p], hint: p === "private" ? "راجعه في يوتيوب أولًا" : p === "unlisted" ? "لمن يملك الرابط" : "يظهر للجميع" }))} />
          <Field label="جدولة النشر (اختياري)" htmlFor="yt-at" hint="يُرفع الآن خاصًا، ويصبح عامًا تلقائيًا في الموعد.">
            <Input id="yt-at" type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} className="ltr text-end" />
          </Field>
          <label className="flex gap-3 rounded-2xl bg-sun-soft p-4 text-sm cursor-pointer">
            <input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} className="mt-1 size-4 accent-[var(--accent)]" />
            <span>
              <b>هذا المقطع موجّه للأطفال ومناسب لهم.</b> سيُوسم في يوتيوب «مخصص للأطفال» (متطلب قانون COPPA): تُعطَّل التعليقات والإعلانات المخصّصة وبعض الميزات. {data.project.voiceMode === "ai" ? "وسيُفصح عن استخدام صوت مولّد بالذكاء الاصطناعي." : ""}
            </span>
          </label>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <JobStatus job={job} onChange={() => onChange()} />
          <div>
            <Button onClick={publish} loading={busy} disabled={!kids || isActive(job) || !meta.title.trim()} className="bg-yt shadow-none" icon={<YoutubeIcon className="size-4" />}>
              {schedule ? "ارفع وجدول النشر" : "انشر على يوتيوب"}
            </Button>
          </div>
        </div>
      )}
      {data.uploads.length ? (
        <ul className="mt-5 divide-y divide-line border-t border-line">
          {data.uploads.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
              <Badge tone={u.status === "uploaded" ? "ok" : u.status === "failed" ? "danger" : "info"}>{u.status === "uploaded" ? "نُشر" : u.status === "failed" ? "فشل" : "جارٍ الرفع"}</Badge>
              <span className="text-muted">{PRIVACY[u.privacy as Privacy]}{u.publishAt ? ` · مجدول ${fmtDate(u.publishAt)}` : ""} · {fmtDate(u.createdAt)}</span>
              {u.url ? <a href={u.url} target="_blank" rel="noreferrer" className="ms-auto inline-flex items-center gap-1 font-bold text-accent">مشاهدة <ExternalLink className="size-3.5" aria-hidden /></a> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
