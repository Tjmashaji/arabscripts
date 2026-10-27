import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer, Logo } from "@/components/site";
import { Card, VerifiedMark } from "@/components/ui";
import { date } from "@/lib/format";
import { publicVerification } from "@/server/public";

export const metadata: Metadata = { title: "التحقق من توثيق متجر", robots: { index: false } };

// صفحة عامة يفتحها العميل من شارة المتجر: تعرض الحالة الحالية من قاعدة البيانات، لا من الشارة نفسها
export default async function VerifyPage({ params }: PageProps<"/v/[publicId]">) {
  const { publicId } = await params;
  const s = await publicVerification(publicId);
  if (!s) notFound();
  const ok = s.verified && s.active;
  return (
    <>
      <header className="mx-auto w-full max-w-6xl px-4 py-4"><Logo /></header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-10">
        <Card className={ok ? "border-brand/40" : ""}>
          <div className="flex items-start gap-3">
            {ok ? <VerifiedMark className="size-10 text-brand shrink-0" /> : <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-xl" aria-hidden>؟</span>}
            <div>
              <h1 className="font-display text-xl">{s.name || "متجر"}</h1>
              {s.domain ? <p className="ltr text-sm text-muted">{s.domain}</p> : null}
            </div>
          </div>
          {ok ? (
            <p className="mt-4 text-ink-2">
              هذا المتجر <strong className="text-brand">موثق</strong> لدى رادار الترند منذ {date(s.verified_at)}، باسم «{s.legal_name}». راجع فريقنا وثيقته الرسمية وتأكد من ملكيته للمتجر عبر سلة.
            </p>
          ) : (
            <p className="mt-4 text-ink-2">
              هذا المتجر {s.active ? "غير موثق لدينا حاليًا" : "لم يعد يستخدم المنصة"}. إذا رأيت شارة توثيق تشير إلى هذه الصفحة فهي لا تعني أنه موثق.
            </p>
          )}
          <p className="mt-4 text-xs text-muted">تأكد أن عنوان هذه الصفحة يبدأ بعنوان منصتنا. التوثيق يثبت هوية البائع، ولا يضمن جودة المنتجات.</p>
        </Card>
      </main>
      <Footer />
    </>
  );
}
