"use client";
import { CheckCircle2, CircleOff } from "lucide-react";
import { YoutubeIcon as Youtube } from "./logo";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { fmtDate } from "@/lib/format";
import { Badge, Button, Card, Notice } from "./ui";

const STATUS: Record<string, { tone: "ok" | "warn" | "danger"; text: string }> = {
  connected: { tone: "ok", text: "رُبطت القناة بنجاح." },
  denied: { tone: "warn", text: "أُلغي الربط من صفحة Google." },
  invalid: { tone: "danger", text: "انتهت صلاحية طلب الربط. حاول مرة أخرى." },
  scopes: { tone: "warn", text: "لم تُمنح كل الصلاحيات المطلوبة (الرفع وقراءة القناة). أعد الربط ووافق على الصلاحيتين." },
  no_refresh: { tone: "danger", text: "لم تُعد Google رمز وصول دائمًا. ألغِ وصول التطبيق من حساب Google ثم أعد الربط." },
  no_channel: { tone: "warn", text: "هذا الحساب لا يملك قناة يوتيوب. أنشئ قناة ثم أعد الربط." },
  error: { tone: "danger", text: "تعذّر إكمال الربط. حاول لاحقًا." },
};

type Channel = { channelId: string; title: string; thumbnail: string | null; connectedAt: number } | null;

export function SettingsView({ channel, services, redirectUri, status }: { channel: Channel; services: { youtube: boolean; claude: boolean; voice: boolean }; redirectUri: string; status: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = status ? STATUS[status] : null;

  async function disconnect() {
    if (!confirm("فصل القناة؟ ستحتاج إلى ربطها مجددًا للنشر.")) return;
    setBusy(true);
    try {
      await api("/api/youtube/disconnect", { body: {} });
      router.refresh();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const rows = [
    { name: "ربط يوتيوب (Google OAuth)", on: services.youtube, env: "GOOGLE_CLIENT_ID · GOOGLE_CLIENT_SECRET", use: "نشر المقاطع على قناتك" },
    { name: "المخرج الذكي (Claude)", on: services.claude, env: "ANTHROPIC_API_KEY", use: "كتابة دروس المواضيع المخصصة" },
    { name: "الصوت الذكي (ElevenLabs)", on: services.voice, env: "ELEVENLABS_API_KEY · ELEVENLABS_VOICE_ID", use: "تعليق صوتي آلي لكل مشهد" },
  ];

  return (
    <div className="grid gap-5 max-w-3xl">
      {s ? <Notice tone={s.tone}>{s.text}</Notice> : null}
      <Card>
        <h2 className="font-display text-lg mb-4 flex items-center gap-2"><Youtube className="size-5 text-yt" aria-hidden /> قناة يوتيوب</h2>
        {channel ? (
          <div className="flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {channel.thumbnail ? <img src={channel.thumbnail} alt="" width={48} height={48} className="rounded-full" referrerPolicy="no-referrer" /> : null}
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{channel.title}</p>
              <p className="text-xs text-muted">مربوطة منذ {fmtDate(channel.connectedAt)}</p>
            </div>
            <a href={`https://www.youtube.com/channel/${channel.channelId}`} target="_blank" rel="noreferrer" className="text-sm font-bold text-accent">فتح القناة</a>
            <Button variant="danger" onClick={disconnect} loading={busy}>فصل</Button>
          </div>
        ) : services.youtube ? (
          <div className="flex flex-col gap-3 items-start">
            <p className="text-ink-2 text-sm">سنطلب صلاحيتين فقط: رفع الفيديو، وقراءة اسم القناة. لا نستطيع حذف أو تعديل مقاطعك الأخرى.</p>
            <a href="/api/youtube/connect" className="inline-flex items-center gap-2 rounded-xl bg-yt px-4 h-11 text-white font-bold"><Youtube className="size-4" aria-hidden /> ربط قناة يوتيوب</a>
          </div>
        ) : (
          <Notice tone="warn" title="ربط يوتيوب غير مُعدّ على الخادم">
            أنشئ «OAuth client» من نوع Web application في Google Cloud Console، وفعّل YouTube Data API v3، وأضف رابط العودة التالي، ثم ضع المعرّف والسر في متغيرات البيئة:
            <code className="block ltr text-start mt-2 rounded bg-surface px-2 py-1 text-xs break-all">{redirectUri}</code>
          </Notice>
        )}
        {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}
      </Card>
      <Card>
        <h2 className="font-display text-lg mb-4">الخدمات المتصلة</h2>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.name} className="flex flex-wrap items-center gap-3 py-3">
              {r.on ? <CheckCircle2 className="size-5 text-ok" aria-hidden /> : <CircleOff className="size-5 text-muted" aria-hidden />}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{r.name}</p>
                <p className="text-xs text-muted">{r.use} · <span className="ltr">{r.env}</span></p>
              </div>
              <Badge tone={r.on ? "ok" : "neutral"}>{r.on ? "متصل" : "غير متصل"}</Badge>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted mt-3">الدروس الجاهزة والتسجيل بصوتك والتصدير تعمل دون أي مفتاح.</p>
      </Card>
    </div>
  );
}
