import type { Metadata } from "next";
import Link from "next/link";
import { DeleteDataForm } from "@/components/forms";
import { buttonCls, Card, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { setConsent } from "@/server/actions";
import { requireStore } from "@/server/auth/session";
import { asStore } from "@/server/db";
import { myStore } from "@/server/queries";

export const metadata: Metadata = { title: "الإعدادات" };

export default async function Settings() {
  const v = await requireStore();
  const store = (await asStore(v.storeId, myStore))!;
  return (
    <>
      <PageHeader title="الإعدادات" />
      <div className="grid gap-4">
        <Card>
          <h2 className="font-bold text-lg">المشاركة المجهولة</h2>
          <p className="mt-1 text-ink-2">
            {store.contributes
              ? `مفعّلة منذ ${dateTime(store.consent_at)}. مبيعاتك تدخل في حساب الترند مجمعة مع غيرها، وترى الترند في المقابل.`
              : "متوقفة. مبيعاتك لا تدخل في الحساب، ولا يظهر لك الترند."}{" "}
            <Link href="/privacy" className="underline">كيف نحمي بياناتك</Link>
          </p>
          <form action={setConsent} className="mt-4">
            {store.contributes ? null : <input type="hidden" name="contributes" value="on" />}
            <input type="hidden" name="back" value="/settings" />
            <button className={buttonCls(store.contributes ? "secondary" : "primary")}>{store.contributes ? "إيقاف المشاركة" : "تفعيل المشاركة"}</button>
          </form>
        </Card>
        <Card>
          <h2 className="font-bold text-lg">حذف بيانات متجري</h2>
          <p className="mt-1 mb-4 text-ink-2">يحذف كل الطلبات والمنتجات المخزنة لمتجرك لدينا، ويوقف المشاركة. يبقى الربط مع سلة. لحذف كل شيء نهائيًا احذف التطبيق من لوحة سلة، فنحذف البيانات والرموز تلقائيًا.</p>
          <DeleteDataForm />
        </Card>
      </div>
    </>
  );
}
