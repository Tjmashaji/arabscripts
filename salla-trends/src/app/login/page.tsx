import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer, Logo } from "@/components/site";
import { Card, LinkButton, Notice } from "@/components/ui";
import { currentViewer } from "@/server/auth/session";
import { env, sallaConfigured } from "@/server/env";

export const metadata: Metadata = { title: "دخول التجار" };

const ERRORS: Record<string, string> = {
  denied: "ألغيت الموافقة في سلة. يمكنك المحاولة مرة أخرى متى شئت.",
  state: "انتهت صلاحية محاولة الدخول أو جاءت من مصدر غير معروف. ابدأ من جديد.",
  salla: "تعذر إكمال الدخول مع سلة الآن. حاول بعد قليل.",
  rate_limited: "محاولات كثيرة خلال وقت قصير. انتظر ربع ساعة ثم حاول.",
  not_configured: "الدخول عبر سلة غير مفعّل بعد على هذه النسخة (بيانات التطبيق غير مضبوطة).",
};

export default async function Login({ searchParams }: PageProps<"/login">) {
  const v = await currentViewer();
  if (v) redirect(v.kind === "store" ? "/dashboard" : "/admin");
  const { error } = await searchParams;
  const msg = typeof error === "string" ? ERRORS[error] : undefined;
  const install = env().SALLA_INSTALL_URL;
  return (
    <>
      <header className="mx-auto w-full max-w-6xl px-4 py-4"><Logo /></header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <Card>
          <h1 className="font-display text-2xl">دخول التجار</h1>
          <p className="mt-2 text-ink-2">ندخلك عبر حسابك في سلة، فلا كلمة مرور جديدة تحفظها. نحتاج فقط أن تكون مالك المتجر أو مخولًا منه.</p>
          {msg ? <div className="mt-4"><Notice tone="danger">{msg}</Notice></div> : null}
          <div className="mt-6 grid gap-3">
            {sallaConfigured() ? <a href="/api/auth/salla/start" className="inline-flex h-12 items-center justify-center rounded-xl bg-brand px-4 font-bold text-brand-ink hover:brightness-110">الدخول عبر سلة</a> : null}
            {install ? <LinkButton href={install} variant="secondary">لم تثبت التطبيق بعد؟ ثبّته من سلة</LinkButton> : null}
          </div>
          <p className="mt-6 text-xs text-muted">بالدخول توافق على <Link href="/privacy" className="underline">سياسة البيانات</Link>. لن نشارك اسم متجرك أو بيانات عملائك مع أي أحد.</p>
        </Card>
        <p className="mt-4 text-center text-sm"><Link href="/admin/login" className="text-muted hover:text-ink">دخول فريق المنصة</Link></p>
      </main>
      <Footer />
    </>
  );
}
