import { ArrowLeft, Mic, Sparkles, Upload, Wand2 } from "lucide-react";
import Link from "next/link";
import { Emoji } from "@/components/emoji";
import { Logo } from "@/components/logo";
import { CATEGORIES, CATEGORY_IDS } from "@/lib/domain";
import { currentUser } from "@/server/auth/session";

const STEPS = [
  { icon: Wand2, title: "اختر الدرس", text: "حرف، رقم، لون، شكل، حيوان، أو عادة جميلة. أو اكتب موضوعك ويكتبه المخرج الذكي." },
  { icon: Sparkles, title: "عدّل المشاهد", text: "النص الكبير، والجملة المسموعة، والرسوم، والألوان. معاينة فورية بمقاس الشورتس." },
  { icon: Mic, title: "أضف الصوت", text: "سجّل بصوتك من المتصفح، أو ولّد صوتًا ذكيًا، أو اكتفِ بالموسيقى والنص." },
  { icon: Upload, title: "انشر على يوتيوب", text: "فيديو عمودي جاهز، يُرفع إلى قناتك موسومًا «مخصص للأطفال»، فورًا أو في موعد تختاره." },
];

export default async function Landing() {
  const user = await currentUser();
  return (
    <div className="flex-1">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/dashboard" className="rounded-xl bg-ink px-4 h-10 inline-flex items-center text-white font-bold text-sm">مقاطعي</Link>
          ) : (
            <>
              <Link href="/login" className="rounded-xl px-4 h-10 inline-flex items-center font-bold text-sm hover:bg-surface-2">تسجيل الدخول</Link>
              <Link href="/signup" className="rounded-xl bg-ink px-4 h-10 inline-flex items-center text-white font-bold text-sm">ابدأ الآن</Link>
            </>
          )}
        </nav>
      </header>
      <section className="mx-auto max-w-6xl px-5 pt-8 pb-16 grid gap-10 lg:grid-cols-[1.2fr_1fr] items-center">
        <div>
          <p className="inline-flex rounded-full bg-sun-soft px-3 py-1 text-xs font-bold text-amber mb-4">مرتبط بيوتيوب · عربي بالكامل</p>
          <h1 className="font-display text-4xl sm:text-5xl leading-[1.35]">مقاطع تعليمية قصيرة لأطفالك، جاهزة لقناتك في دقائق</h1>
          <p className="text-ink-2 text-lg mt-5 max-w-xl">منصة تصنع شورتس عمودية بنص عربي سليم ورسوم مرحة وصوت واضح، ثم ترفعها مباشرة إلى قناتك على يوتيوب.</p>
          <div className="flex flex-wrap gap-3 mt-8">
            <Link href={user ? "/new" : "/signup"} className="rounded-xl bg-accent px-5 h-12 inline-flex items-center gap-2 text-white font-bold">
              اصنع أول مقطع <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
        <div className="mx-auto w-56 aspect-[9/16] rounded-[32px] border-[6px] border-ink bg-[#4FC3F7] relative overflow-hidden shadow-xl" aria-hidden>
          <p className="absolute top-[12%] inset-x-0 text-center font-display text-4xl text-white [text-shadow:0_3px_0_#2B1E4A]">بطة</p>
          <div className="absolute inset-x-0 top-[30%] grid place-items-center"><Emoji e="🦆" size={150} className="bob" /></div>
          <p className="absolute bottom-[22%] inset-x-6 text-center rounded bg-black/40 text-white text-xs py-1">بطة تبدأ بحرف الباء</p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <h2 className="font-display text-2xl mb-6">دروس جاهزة بلا أي إعداد</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {CATEGORY_IDS.map((c) => (
            <div key={c} className="rounded-2xl border border-line bg-surface p-4 text-center">
              <Emoji e={CATEGORIES[c].icon} size={40} className="mx-auto" />
              <p className="font-bold mt-2 text-sm">{CATEGORIES[c].label}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 pb-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <div key={s.title} className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent"><s.icon className="size-4" aria-hidden /></span>
              <span className="text-xs font-bold text-muted">الخطوة {i + 1}</span>
            </div>
            <h3 className="font-bold">{s.title}</h3>
            <p className="text-sm text-ink-2 mt-1">{s.text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
