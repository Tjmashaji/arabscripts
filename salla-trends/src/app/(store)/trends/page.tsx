import type { Metadata } from "next";
import Link from "next/link";
import { ConsentCard } from "@/components/consent";
import { TrendTable } from "@/components/trend-table";
import { buttonCls, Card, cx, Empty, PageHeader } from "@/components/ui";
import { dateTime, num } from "@/lib/format";
import { REGIONS } from "@/lib/regions";
import { TAXONOMY } from "@/lib/taxonomy";
import { requireStore } from "@/server/auth/session";
import { asStore } from "@/server/db";
import { latestRun, myStore, trendItems, type TrendFilter } from "@/server/queries";

export const metadata: Metadata = { title: "الترند" };

const REGION_CODES = new Set<string>(["ALL", ...REGIONS.map((r) => r.code)]);
const TAX_CODES = new Set<string>(["ALL", ...TAXONOMY.map((t) => t.code)]);

function filterFrom(sp: Record<string, string | string[] | undefined>): TrendFilter {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  return {
    kind: one("kind") === "best" ? "best" : "trending",
    window: one("window") === "30" ? 30 : 7,
    region: REGION_CODES.has(one("region")) ? one("region") : "ALL",
    taxonomy: TAX_CODES.has(one("taxonomy")) ? one("taxonomy") : "ALL",
  };
}

const selectCls = "h-11 rounded-xl border border-line bg-surface px-3 text-[15px]";

export default async function Trends({ searchParams }: PageProps<"/trends">) {
  const v = await requireStore();
  const f = filterFrom(await searchParams);
  const { store, run, items } = await asStore(v.storeId, async (tx) => {
    const store = (await myStore(tx))!;
    const run = await latestRun(tx);
    return { store, run, items: run ? await trendItems(tx, run.id, f) : [] };
  });
  const tab = (kind: "trending" | "best") => `/trends?${new URLSearchParams({ kind, window: String(f.window), region: f.region, taxonomy: f.taxonomy })}`;

  return (
    <>
      <PageHeader
        title="الترند في السوق"
        subtitle={run ? `محدث ${dateTime(run.finished_at)} · من ${num(run.contributing_stores)} متجرًا مشاركًا` : "يُحسب يوميًا من مبيعات المتاجر المشاركة."}
      />
      {!store.contributes ? (
        <ConsentCard back="/trends" />
      ) : (
        <Card>
          <div className="mb-4 flex gap-2" role="tablist">
            <Link href={tab("trending")} role="tab" aria-selected={f.kind === "trending"} className={buttonCls(f.kind === "trending" ? "primary" : "secondary")}>الأسرع صعودًا</Link>
            <Link href={tab("best")} role="tab" aria-selected={f.kind === "best"} className={buttonCls(f.kind === "best" ? "primary" : "secondary")}>الأكثر مبيعًا</Link>
          </div>
          <form className="mb-5 flex flex-wrap items-end gap-3" method="get">
            <input type="hidden" name="kind" value={f.kind} />
            <label className="grid gap-1 text-sm">
              <span className="font-bold">الفترة</span>
              <select name="window" defaultValue={String(f.window)} className={selectCls}>
                <option value="7">آخر 7 أيام</option>
                <option value="30">آخر 30 يومًا</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-bold">المنطقة</span>
              <select name="region" defaultValue={f.region} className={selectCls}>
                <option value="ALL">كل المناطق</option>
                {REGIONS.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-bold">التصنيف</span>
              <select name="taxonomy" defaultValue={f.taxonomy} className={selectCls}>
                <option value="ALL">كل التصنيفات</option>
                {TAXONOMY.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </label>
            <button className={buttonCls("secondary")}>عرض</button>
          </form>

          {!run ? (
            <Empty title="لم يُحسب الترند بعد">يبدأ الحساب عندما يجتمع عدد كافٍ من المتاجر المشاركة.</Empty>
          ) : items.length === 0 ? (
            <Empty title="لا منتجات كافية لهذا الاختيار">
              نعرض المنتج فقط إذا باعه {num(run.min_stores)} متاجر مختلفة على الأقل في الفترة. جرّب منطقة أوسع أو فترة أطول.
            </Empty>
          ) : (
            <TrendTable items={items} kind={f.kind} />
          )}
          <p className={cx("mt-4 text-xs text-muted")}>
            {f.kind === "trending"
              ? "الصعود يقارن الفترة الحالية بالسابقة بنفس الطول، ويرجّح النمو الذي يقوم على حجم مبيعات معتبر. «ناشئ» تعني أن المنتج لم يكن يباع بما يكفي في الفترة السابقة لحساب نسبة."
              : "الترتيب بعدد الوحدات المباعة في الفترة. الطلبات الملغاة والمسترجعة وغير المدفوعة لا تُحسب."}
          </p>
        </Card>
      )}
    </>
  );
}
