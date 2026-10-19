import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { YoutubeIcon as Youtube } from "@/components/logo";
import Link from "next/link";
import { Emoji } from "@/components/emoji";
import { Badge, EmptyState, LinkButton, Notice, PageHeader } from "@/components/ui";
import { AGES, CATEGORIES } from "@/lib/domain";
import { fmtDate, fmtSec } from "@/lib/format";
import { requireUser } from "@/server/auth/session";
import { services } from "@/server/env";
import { listProjects } from "@/server/services/projects";
import { getChannel } from "@/server/services/youtube";

export const metadata: Metadata = { title: "مقاطعي" };

export default async function Dashboard() {
  const user = await requireUser();
  const projects = listProjects(user.id);
  const channel = getChannel(user.id);
  return (
    <>
      <PageHeader title="مقاطعي" subtitle="كل درس قصير تصنعه هنا، من الفكرة حتى النشر على يوتيوب." actions={<LinkButton href="/new" icon={<Plus className="size-4" />}>مقطع جديد</LinkButton>} />
      {!channel ? (
        <div className="mb-6">
          <Notice tone="info" title="اربط قناتك على يوتيوب" action={<LinkButton href="/settings" variant="secondary" icon={<Youtube className="size-4 text-yt" />}>{services().youtube ? "ربط القناة" : "الإعدادات"}</LinkButton>}>
            يمكنك صنع المقاطع وتنزيلها دون ربط، لكن النشر المباشر يحتاج قناة مربوطة.
          </Notice>
        </div>
      ) : null}
      {projects.length === 0 ? (
        <EmptyState icon={<Emoji e="🧸" size={32} />} title="لا توجد مقاطع بعد" action={<LinkButton href="/new" icon={<Plus className="size-4" />}>اصنع أول مقطع</LinkButton>}>
          اختر درسًا جاهزًا مثل حرف الباء أو العد إلى خمسة، وسيكون المقطع جاهزًا للمعاينة خلال ثوانٍ.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="group block rounded-[var(--radius-card)] border border-line bg-surface p-2.5 hover:border-ink-2 transition">
                <div className="relative aspect-[9/16] rounded-2xl overflow-hidden grid place-items-center" style={{ background: p.cover?.bg ?? "#ece7ff" }}>
                  {p.render ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${p.render.thumb}`} alt="" className="absolute inset-0 size-full object-cover" />
                  ) : p.cover?.emoji[0] ? (
                    <Emoji e={p.cover.emoji[0]} size={80} />
                  ) : (
                    <span className="font-display text-4xl text-white">{p.cover?.text}</span>
                  )}
                  {p.upload?.video_id ? <Badge tone="danger" className="absolute top-2 start-2 bg-yt text-white"><Youtube className="size-3" aria-hidden /> منشور</Badge> : p.render ? <Badge tone="ok" className="absolute top-2 start-2">جاهز {fmtSec(p.render.duration_ms)}</Badge> : null}
                </div>
                <div className="px-1 pt-2.5 pb-1">
                  <p className="font-bold truncate group-hover:text-accent">{p.title}</p>
                  <p className="text-xs text-muted mt-0.5">{CATEGORIES[p.category].label} · {AGES[p.age]}</p>
                  <p className="text-xs text-muted">{fmtDate(p.updatedAt)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
