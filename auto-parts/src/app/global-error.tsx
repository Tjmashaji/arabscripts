"use client";

import "./globals.css";

// آخر خط دفاع إذا تعطل التخطيط نفسه: صفحة مستقلة ثنائية اللغة بلا اعتماد على الترجمة أو قاعدة البيانات.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="flex min-h-dvh items-center justify-center bg-surface p-4 font-sans">
        <main className="flex max-w-md flex-col gap-3 rounded-xl border border-line bg-card p-6">
          <h1 className="text-2xl font-bold">حدث خطأ غير متوقع</h1>
          <p className="text-muted">نعتذر، تعذّر عرض الصفحة. حاول مرة أخرى بعد قليل.</p>
          <p lang="en" dir="ltr" className="text-sm text-muted">Something went wrong. Please try again shortly.</p>
          {error.digest && <p className="text-xs text-muted" dir="ltr">Ref: {error.digest}</p>}
          <button onClick={reset} className="min-h-11 rounded-lg bg-accent px-4 font-bold text-white">إعادة المحاولة · Retry</button>
        </main>
      </body>
    </html>
  );
}
