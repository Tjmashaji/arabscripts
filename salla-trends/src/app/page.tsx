import { Footer, Logo } from "@/components/site";
import { LinkButton } from "@/components/ui";
import { env } from "@/server/env";

const STEPS = [
  { t: "ثبّت التطبيق من متجر تطبيقات سلة", d: "بضغطة واحدة. نطلب صلاحية قراءة الطلبات والمنتجات فقط، ولا نعدّل أي شيء في متجرك." },
  { t: "وافق على المشاركة المجهولة", d: "مبيعاتك تدخل في المجموع مع غيرها، بلا اسم متجرك وبلا أي بيانات لعملائك." },
  { t: "شاهد ما يبيعه السوق الآن", d: "الأكثر مبيعًا والأسرع صعودًا، لكل منطقة ولكل تصنيف، يتحدث يوميًا." },
];

const FEATURES = [
  { t: "الأكثر مبيعًا في منطقتك", d: "الرياض، جدة ومكة، الشرقية، القصيم… وحتى دول الخليج. اعرف ماذا يطلب عملاء منطقتك تحديدًا." },
  { t: "الترند الصاعد قبل أن يشبع", d: "نقيس سرعة النمو مقارنة بالفترة السابقة، لا الحجم فقط، فترى المنتج وهو يبدأ بالصعود." },
  { t: "فرص لمتجرك", d: "منتجات صاعدة في تصنيفاتك نفسها ولا تبيعها بعد. قائمة جاهزة لقرار الشراء القادم." },
  { t: "توثيق المتجر وشارة الثقة", d: "وثّق متجرك بالسجل التجاري أو وثيقة العمل الحر أو معروف، واعرض شارة يتحقق منها عملاؤك برابط." },
  { t: "ربط آمن مع سلة", d: "رموز الربط مشفرة، والتوقيع يُفحص لكل حدث، وحذف التطبيق يحذف بياناتك من الحساب فورًا." },
  { t: "خصوصية بالتصميم", d: "لا يظهر أي منتج إلا إذا باعه 3 متاجر مختلفة على الأقل، ولا يظهر منتج يهيمن عليه متجر واحد." },
];

export default function Home() {
  const install = env().SALLA_INSTALL_URL;
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <Logo />
        <LinkButton href="/login" variant="secondary">دخول التجار</LinkButton>
      </header>
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-14 pt-10 sm:pt-16">
          <p className="mb-3 inline-block rounded-full bg-hot-soft px-3 py-1 text-sm font-bold text-hot">لتجار سلة</p>
          <h1 className="font-display text-3xl leading-tight sm:text-5xl sm:leading-tight max-w-3xl">
            اعرف ما يبيعه السوق الآن، <span className="text-brand">قبل منافسيك</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-2">
            المنتجات الأكثر مبيعًا والأسرع صعودًا في منطقتك، محسوبة من مبيعات حقيقية لمتاجر سلة، مجمّعة ومجهولة المصدر. بلا تخمين، وبلا جمع بيانات من مواقع أخرى.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {install ? <LinkButton href={install}>ثبّت التطبيق من سلة</LinkButton> : null}
            <LinkButton href="/login" variant={install ? "secondary" : "primary"}>دخول عبر سلة</LinkButton>
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <ol className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.t} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-brand-ink font-bold num">{i + 1}</span>
                <div>
                  <div className="font-bold">{s.t}</div>
                  <p className="text-[15px] text-ink-2">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-display text-2xl mb-6">ماذا تحصل عليه</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.t} className="rounded-2xl border border-line bg-surface p-5">
                <div className="font-bold">{f.t}</div>
                <p className="mt-1 text-[15px] text-ink-2">{f.d}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
