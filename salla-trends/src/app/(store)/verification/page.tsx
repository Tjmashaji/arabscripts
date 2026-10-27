import type { Metadata } from "next";
import { VerificationForm } from "@/components/forms";
import { Badge, Card, Notice, PageHeader, VerifiedMark } from "@/components/ui";
import { date } from "@/lib/format";
import { VERIFICATION_KINDS, type VerificationKind } from "@/lib/verification";
import { requireStore } from "@/server/auth/session";
import { asStore } from "@/server/db";
import { env } from "@/server/env";
import { myStore, myVerifications } from "@/server/queries";

export const metadata: Metadata = { title: "توثيق المتجر" };

const STATUS = { pending: { l: "قيد المراجعة", t: "warn" }, approved: { l: "معتمد", t: "ok" }, rejected: { l: "مرفوض", t: "danger" } } as const;

export default async function Verification() {
  const v = await requireStore();
  const { store, history } = await asStore(v.storeId, async (tx) => ({ store: (await myStore(tx))!, history: await myVerifications(tx) }));
  const base = env().APP_URL;
  const page = `${base}/v/${store.public_id}`;
  const badge = `${base}/api/badge/${store.public_id}`;
  const lastRejected = history.find((h) => h.status === "rejected");

  return (
    <>
      <PageHeader title="توثيق المتجر" subtitle="وثّق متجرك بوثيقة رسمية، واعرض شارة يتحقق منها عملاؤك بأنفسهم." />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          {store.verification_status === "verified" ? (
            <div className="flex items-start gap-3">
              <VerifiedMark className="size-8 text-brand" />
              <div>
                <h2 className="font-bold text-lg">متجرك موثق</h2>
                <p className="text-ink-2">باسم {store.verified_legal_name} منذ {date(store.verified_at)}.</p>
              </div>
            </div>
          ) : store.verification_status === "pending" ? (
            <Notice tone="warn" title="طلبك قيد المراجعة">نراجع الطلبات خلال يومي عمل عادةً. ستظهر النتيجة هنا.</Notice>
          ) : (
            <>
              {lastRejected ? (
                <div className="mb-4">
                  <Notice tone="danger" title="رُفض طلبك السابق">{lastRejected.reviewer_note ?? "بدون ملاحظة"}. صحّح ما يلزم وأرسل طلبًا جديدًا.</Notice>
                </div>
              ) : null}
              <h2 className="mb-4 font-bold text-lg">طلب توثيق جديد</h2>
              <VerificationForm />
            </>
          )}
        </Card>

        <Card>
          <h2 className="font-bold text-lg">شارة الثقة</h2>
          <p className="mt-1 text-[15px] text-ink-2">ضعها في متجرك. الضغط عليها يفتح صفحة على منصتنا تؤكد حالة التوثيق الحالية، فلا يمكن نسخها لمتجر آخر.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/badge/${store.public_id}?s=${store.verification_status}`} alt="شارة التوثيق" className="mt-4 h-10" />
          <label className="mt-4 block text-sm font-bold" htmlFor="embed">كود الشارة</label>
          <textarea id="embed" readOnly dir="ltr" rows={4} className="mt-1 w-full rounded-xl border border-line bg-surface-2 p-2 text-xs font-mono"
            defaultValue={`<a href="${page}" target="_blank" rel="noopener"><img src="${badge}" alt="متجر موثق" height="40"></a>`} />
          <p className="mt-2 text-xs text-muted">صفحة التحقق: <a href={`/v/${store.public_id}`} className="underline ltr">{page}</a></p>
        </Card>
      </div>

      {history.length ? (
        <Card className="mt-4">
          <h2 className="mb-3 font-bold text-lg">سجل الطلبات</h2>
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 py-2.5 text-[15px]">
                <span>{VERIFICATION_KINDS[h.kind as VerificationKind]?.name ?? h.kind}</span>
                <span className="ltr text-ink-2">{h.number}</span>
                <span className="text-muted text-sm">{date(h.created_at)}</span>
                <span className="ms-auto"><Badge tone={STATUS[h.status as keyof typeof STATUS].t}>{STATUS[h.status as keyof typeof STATUS].l}</Badge></span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
