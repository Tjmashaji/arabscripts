import type { Metadata } from "next";
import Link from "next/link";
import { ConsentCard } from "@/components/consent";
import { TrendTable } from "@/components/trend-table";
import { Badge, Card, Empty, LinkButton, Notice, PageHeader, Stat } from "@/components/ui";
import { date, dateTime, num, sar } from "@/lib/format";
import { taxonomyName } from "@/lib/taxonomy";
import { requireStore } from "@/server/auth/session";
import { asStore } from "@/server/db";
import { latestRun, myJobs, myStore, opportunities, ownStats, ownTopProducts, trendItems } from "@/server/queries";

export const metadata: Metadata = { title: "لوحتي" };

const JOB_NAMES: Record<string, string> = { sync_store: "بيانات المتجر", sync_products: "المنتجات", backfill_orders: "الطلبات السابقة" };
const JOB_STATUS: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  queued: { label: "في الانتظار", tone: "neutral" },
  running: { label: "جارية", tone: "warn" },
  done: { label: "اكتملت", tone: "ok" },
  failed: { label: "تعثرت", tone: "danger" },
};

export default async function Dashboard() {
  const v = await requireStore();
  const data = await asStore(v.storeId, async (tx) => {
    const store = (await myStore(tx))!;
    const [jobs, stats, top, run] = await Promise.all([myJobs(tx), ownStats(tx), ownTopProducts(tx, 30, 5), latestRun(tx)]);
    const trending = run ? await trendItems(tx, run.id, { kind: "trending", window: 7, region: "ALL", taxonomy: "ALL", limit: 5 }) : [];
    const ops = run ? await opportunities(tx, run.id, 7, 5) : [];
    return { store, jobs, stats, top, run, trending, ops };
  });
  const { store, jobs, stats, top, run, trending, ops } = data;
  const syncing = jobs.some((j) => j.status === "queued" || j.status === "running");
  const failed = jobs.find((j) => j.status === "failed");

  return (
    <>
      <PageHeader
        title={`أهلًا، ${store.name || "متجرك"}`}
        subtitle={store.last_synced_at ? `آخر مزامنة كاملة: ${dateTime(store.last_synced_at)}` : "نجهز بيانات متجرك لأول مرة."}
        actions={<LinkButton href="/trends">استكشف الترند</LinkButton>}
      />

      <div className="grid gap-4">
        {!store.contributes ? <ConsentCard back="/dashboard" /> : null}
        {failed ? (
          <Notice tone="danger" title="تعثرت المزامنة مع سلة">
            {failed.last_error ?? "خطأ غير معروف"}. إذا استمرت المشكلة أعد تثبيت التطبيق من سلة.
          </Notice>
        ) : syncing ? (
          <Notice tone="warn" title="المزامنة جارية">نسحب منتجاتك وطلبات آخر 90 يومًا. الطلبات الجديدة تصلنا فورًا من سلة.</Notice>
        ) : null}

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Stat label="وحدات مباعة (30 يومًا)" value={num(stats.units)} />
          <Stat label="طلبات (30 يومًا)" value={num(stats.orders)} />
          <Stat label="المبيعات (30 يومًا)" value={sar(stats.revenue_halalas)} hint="لا يراها غيرك" />
          <Stat label="منتجات في الكتالوج" value={num(stats.products)} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-lg">صاعد هذا الأسبوع</h2>
              <Link href="/trends?kind=trending" className="text-sm text-brand font-bold">الكل</Link>
            </div>
            {!store.contributes ? (
              <Empty title="يظهر بعد تفعيل المشاركة" />
            ) : !run ? (
              <Empty title="لم يُحسب الترند بعد">يُحسب يوميًا بعد أن يجتمع عدد كافٍ من المتاجر المشاركة.</Empty>
            ) : (
              <TrendTable items={trending} kind="trending" compact />
            )}
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-lg">فرص لمتجرك</h2>
              <Link href="/opportunities" className="text-sm text-brand font-bold">الكل</Link>
            </div>
            {!store.contributes || !run ? (
              <Empty title="تظهر بعد حساب الترند" />
            ) : ops.length === 0 ? (
              <Empty title="لا فرص جديدة الآن">لا يوجد منتج صاعد في تصنيفاتك إلا وتبيعه بالفعل.</Empty>
            ) : (
              <TrendTable items={ops} kind="trending" compact />
            )}
          </Card>
        </div>

        <Card>
          <h2 className="mb-3 font-bold text-lg">الأكثر مبيعًا في متجرك (30 يومًا)</h2>
          {top.length === 0 ? (
            <Empty title="لا مبيعات مسجلة بعد">{syncing ? "ستظهر هنا بعد اكتمال المزامنة." : "ستظهر هنا مع أول طلب."}</Empty>
          ) : (
            <ol className="divide-y divide-line">
              {top.map((p, i) => (
                <li key={p.fingerprint} className="flex items-center gap-3 py-2.5">
                  <span className="w-6 text-muted num">{i + 1}</span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <Badge>{taxonomyName(p.taxonomy)}</Badge>
                  <span className="w-20 text-left num">{num(p.units)} وحدة</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-bold text-lg">حالة الربط</h2>
          <ul className="grid gap-2 sm:grid-cols-3">
            {Object.entries(JOB_NAMES).map(([k, label]) => {
              const j = jobs.find((x) => x.kind === k);
              const s = JOB_STATUS[j?.status ?? "done"];
              return (
                <li key={k} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                  <span>{label}</span>
                  <Badge tone={s.tone}>{j ? s.label : "—"}</Badge>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm text-muted">
            مثبّت منذ {date(store.installed_at)}.{" "}
            {run ? `آخر حساب للترند: ${dateTime(run.finished_at)} من ${num(run.contributing_stores)} متجرًا مشاركًا.` : null}
          </p>
        </Card>
      </div>
    </>
  );
}
