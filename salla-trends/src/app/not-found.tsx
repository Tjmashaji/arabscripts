import { Footer, Logo } from "@/components/site";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <>
      <header className="mx-auto w-full max-w-6xl px-4 py-4"><Logo /></header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
        <h1 className="font-display text-2xl">الصفحة غير موجودة</h1>
        <p className="mt-2 text-ink-2">ربما تغير الرابط أو حُذفت الصفحة.</p>
        <div className="mt-6"><LinkButton href="/">الرئيسية</LinkButton></div>
      </main>
      <Footer />
    </>
  );
}
