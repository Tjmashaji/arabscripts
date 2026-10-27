import { setConsent } from "@/server/actions";
import { buttonCls } from "./ui";

// «شارك لترى»: الترند محسوب من مبيعات المتاجر المشاركة، فمن يريد رؤيته يشارك بمبيعاته (مجمعة ومجهولة)
export function ConsentCard({ back }: { back: string }) {
  return (
    <div className="rounded-2xl border border-hot/30 bg-hot-soft p-5">
      <h2 className="font-bold text-lg">فعّل المشاركة المجهولة لترى الترند</h2>
      <ul className="mt-2 list-disc ps-5 text-[15px] text-ink-2 space-y-1">
        <li>تدخل كميات مبيعاتك في المجموع مع متاجر أخرى. لا يظهر اسم متجرك ولا أسعارك ولا أرقامك لأي أحد.</li>
        <li>لا نخزن بيانات عملائك إطلاقًا؛ فقط المدينة لحساب المنطقة.</li>
        <li>لا يظهر منتج إلا إذا باعه 3 متاجر مختلفة على الأقل، ولا يظهر منتج يهيمن متجر واحد على مبيعاته.</li>
        <li>تستطيع الإيقاف أو حذف بياناتك في أي وقت من الإعدادات.</li>
      </ul>
      <form action={setConsent} className="mt-4">
        <input type="hidden" name="contributes" value="on" />
        <input type="hidden" name="back" value={back} />
        <button className={buttonCls("primary")}>أوافق، فعّل المشاركة</button>
      </form>
    </div>
  );
}
