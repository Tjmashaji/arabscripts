import { ArrowLeft, Clapperboard, FileVideo, Film, Mic2, Sparkles, Upload, Wand2 } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { currentUser } from "@/server/auth/session";

const STEPS = [
  { icon: Upload, title: "صوّر أو ارفع موادك", text: "صور المحل والمنتجات ومقاطعك الحقيقية، والشعار." },
  { icon: Sparkles, title: "المخرج الإبداعي يقترح", text: "أفكار وسيناريو كامل مقسّم إلى مشاهد بتوقيت واضح، من بياناتك فقط." },
  { icon: Wand2, title: "ولّد أو استخدم لقطاتك", text: "مشهد بالذكاء الاصطناعي، أو مقطعك الحقيقي، أو المزج بينهما." },
  { icon: Mic2, title: "صوت ونصوص عربية", text: "تعليق صوتي بالفصحى أو اللهجة، وترجمة ونصوص عربية سليمة." },
  { icon: Film, title: "مونتاج ذكي", text: "رتّب، قصّ، أضف الموسيقى والشعار والانتقالات." },
  { icon: FileVideo, title: "صدّر لكل منصة", text: "تيك توك وريلز وسناب ويوتيوب بالمقاس الصحيح." },
];

export default async function Landing() {
  const user = await currentUser();
  return (
    <div className="flex-1">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/projects" className="rounded-xl bg-ink px-4 h-10 inline-flex items-center text-white font-bold text-sm">مشاريعي</Link>
          ) : (
            <>
              <Link href="/login" className="rounded-xl px-4 h-10 inline-flex items-center font-bold text-sm hover:bg-surface-2">تسجيل الدخول</Link>
              <Link href="/signup" className="rounded-xl bg-ink px-4 h-10 inline-flex items-center text-white font-bold text-sm">ابدأ مجانًا</Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-5 pt-10 pb-16 grid gap-10 lg:grid-cols-[1.1fr_.9fr] items-center">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
            <Clapperboard className="size-3.5" aria-hidden /> استوديو الإعلانات الذكي
          </p>
          <h1 className="font-display text-4xl sm:text-5xl leading-[1.35] mt-4">إعلان احترافي لنشاطك، من جوالك إلى المنصة.</h1>
          <p className="text-lg text-ink-2 mt-4 max-w-xl">
            لا تحتاج خبرة في التصوير أو كتابة السيناريو أو المونتاج. أعطنا موادك وفكرتك، ونحوّلها إلى خطة إنتاج ومشاهد وصوت وفيديو جاهز للنشر.
          </p>
          <div className="flex flex-wrap gap-3 mt-7">
            <Link href={user ? "/projects/new" : "/signup"} className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 h-12 font-bold text-white shadow-[0_8px_24px_-10px_rgba(232,73,43,.8)]">
              أنشئ إعلانك الأول <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <Link href="/login" className="inline-flex items-center rounded-xl border border-line bg-surface px-5 h-12 font-bold">لدي حساب</Link>
          </div>
        </div>
        <div className="relative">
          <div className="rounded-[28px] bg-ink p-4 shadow-2xl">
            <div className="aspect-[9/12] rounded-2xl bg-gradient-to-br from-[#2a2147] via-[#3a2a5c] to-[#e8492b] p-5 flex flex-col justify-between text-white">
              <div className="flex justify-between text-xs opacity-80"><span>المشهد 1 · خطاف بصري</span><span className="ltr">0:00–0:04</span></div>
              <p className="font-display text-2xl text-center leading-relaxed">تدور مكان يضبط مزاجك؟</p>
              <div className="grid grid-cols-5 gap-1.5">
                {[4, 5, 7, 8, 6].map((d, i) => (
                  <div key={i} className="h-9 rounded-md bg-white/15 text-[10px] grid place-items-center" style={{ gridColumn: "span 1" }}>{d} ث</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface border-y border-line">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="font-display text-2xl mb-8">كيف يعمل؟</h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line p-5 bg-paper">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-ink text-white"><s.icon className="size-5" aria-hidden /></span>
                  <span className="text-xs font-bold text-muted ltr">0{i + 1}</span>
                </div>
                <h3 className="font-bold mt-3">{s.title}</h3>
                <p className="text-sm text-ink-2 mt-1">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 grid gap-6 md:grid-cols-3 text-sm">
        <div><h3 className="font-bold mb-1">بياناتك فقط</h3><p className="text-ink-2">لا نخترع أسعارًا أو عروضًا أو مزايا. كل ما في الإعلان مصدره ما أدخلته أنت.</p></div>
        <div><h3 className="font-bold mb-1">شفافية في التكلفة</h3><p className="text-ink-2">كل عملية توليد تُسجَّل بتكلفتها الفعلية، مع سقف إنفاق شهري تتحكم فيه.</p></div>
        <div><h3 className="font-bold mb-1">ملفاتك محمية</h3><p className="text-ink-2">كل ملف مرتبط بحسابك ومشروعك فقط، ولا يصل إليه غيرك.</p></div>
      </section>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">استوديو الإعلانات الذكي</footer>
    </div>
  );
}
