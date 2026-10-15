// فتح الصفحة المناسبة عند لمس إشعار الجوال: من عامل الخدمة (ويب) أو من Capacitor (أندرويد/آيفون).
// اللمسة قد تصل قبل تسجيل الدخول، فتُحفظ حتى تشترك الواجهة.

let pending: string | null = null;
const subs = new Set<(type: string) => void>();

export function pushOpened(type: string | null | undefined) {
  if (!type) return;
  if (subs.size) subs.forEach((f) => f(type)); else pending = type;
}

export function onPushOpen(cb: (type: string) => void): () => void {
  subs.add(cb);
  if (pending) { const t = pending; pending = null; cb(t); }
  return () => { subs.delete(cb); };
}

if (typeof window !== "undefined") {
  const m = /^#open=([\w-]{1,60})$/.exec(window.location.hash);
  if (m) { pending = m[1]; history.replaceState(null, "", window.location.pathname + window.location.search); }
  navigator.serviceWorker?.addEventListener("message", (e: MessageEvent) => {
    const t = (e.data as { open?: unknown } | null)?.open;
    if (typeof t === "string") pushOpened(t);
  });
}
