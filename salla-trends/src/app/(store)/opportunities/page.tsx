import type { Metadata } from "next";
import { ConsentCard } from "@/components/consent";
import { TrendTable } from "@/components/trend-table";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireStore } from "@/server/auth/session";
import { asStore } from "@/server/db";
import { latestRun, myStore, opportunities } from "@/server/queries";

export const metadata: Metadata = { title: "فرص لمتجري" };

export default async function Opportunities() {
  const v = await requireStore();
  const { store, run, week, month } = await asStore(v.storeId, async (tx) => {
    const store = (await myStore(tx))!;
    const run = await latestRun(tx);
    return {
      store,
      run,
      week: run ? await opportunities(tx, run.id, 7) : [],
      month: run ? await opportunities(tx, run.id, 30) : [],
    };
  });
  return (
    <>
      <PageHeader title="فرص لمتجري" subtitle="منتجات صاعدة في تصنيفاتك نفسها، ولا تبيعها بعد. نحدد تصنيفاتك من كتالوجك ومبيعاتك." />
      {!store.contributes ? (
        <ConsentCard back="/opportunities" />
      ) : !run ? (
        <Empty title="لم يُحسب الترند بعد" />
      ) : (
        <div className="grid gap-4">
          <Card>
            <h2 className="mb-3 font-bold text-lg">صاعد هذا الأسبوع</h2>
            {week.length ? <TrendTable items={week} kind="trending" movement={false} /> : <Empty title="لا فرص هذا الأسبوع" />}
          </Card>
          <Card>
            <h2 className="mb-3 font-bold text-lg">صاعد هذا الشهر</h2>
            {month.length ? <TrendTable items={month} kind="trending" movement={false} /> : <Empty title="لا فرص هذا الشهر" />}
          </Card>
          <p className="text-xs text-muted">المطابقة بالباركود إن وُجد، وإلا بالاسم بعد توحيده. إذا ظهر منتج تبيعه بالفعل، أضف الباركود (GTIN) لمنتجك في سلة لتتحسن المطابقة.</p>
        </div>
      )}
    </>
  );
}
