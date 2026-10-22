"use client";

import { Component, type ReactNode } from "react";
import { reportError } from "@/lib/error-reporter";

// إن تعطّل جزء من الواجهة تظهر رسالة واضحة مع زر إعادة التحميل بدل صفحة بيضاء، ويُسجَّل العطل لمدير النظام.
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    reportError(error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : null);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="crash-screen" role="alert">
      <div>
        <h1>حدث خطأ غير متوقع</h1>
        <p>وصلنا تقرير بالعطل. أعد تحميل الصفحة، وبياناتك المحفوظة لن تضيع. إن كنت سائقًا في رحلة، تبقى عملياتك محفوظة على الجهاز وتُرسل بعد إعادة الفتح.</p>
        <button type="button" onClick={() => window.location.reload()}>إعادة تحميل التطبيق</button>
      </div>
    </main>;
  }
}
