"use client";

import { useEffect, useRef, useState } from "react";

// التحقق من أن المستخدم إنسان (Cloudflare Turnstile) في التسجيل والدخول واستعادة كلمة المرور.
// مفتاح الموقع عام (ليس سرًا) ويُمرَّر وقت البناء من متغير البيئة TURNSTILE_SITE_KEY في Vercel.
// بدونه يبقى التحقق متوقفًا. المفتاح السري يوضع في Supabase فقط (Authentication ← Bot and Abuse Protection).
declare const __TURNSTILE_SITE_KEY__: string | undefined;
export const TURNSTILE_SITE_KEY = typeof __TURNSTILE_SITE_KEY__ === "string" ? __TURNSTILE_SITE_KEY__ : "";

type Turnstile = { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }
let loading: Promise<Turnstile> | null = null;
const load = () => loading ??= new Promise<Turnstile>((resolve, reject) => {
  if (window.turnstile) return resolve(window.turnstile);
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true;
  s.onload = () => window.turnstile ? resolve(window.turnstile) : reject(new Error("TURNSTILE"));
  s.onerror = () => { loading = null; reject(new Error("TURNSTILE")); };
  document.head.appendChild(s);
});

function CaptchaBox({ onToken }: { onToken: (t: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let id: string | null = null; let alive = true;
    load().then((t) => {
      if (!alive || !box.current) return;
      id = t.render(box.current, { sitekey: TURNSTILE_SITE_KEY, language: "ar", callback: (tok: string) => onToken(tok), "expired-callback": () => onToken(null), "error-callback": () => onToken(null) });
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (id) window.turnstile?.remove(id); };
  }, [onToken]);
  return <div className="captcha-box"><div ref={box} />{failed && <p className="auth-message">تعذر تحميل التحقق. تأكد من الاتصال ثم أعد تحميل الصفحة.</p>}</div>;
}

/** widget: يوضع في النموذج. token: يُمرَّر كـ captchaToken. reset: بعد كل محاولة (الرمز يُستخدم مرة واحدة). */
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const enabled = TURNSTILE_SITE_KEY !== "";
  return {
    enabled, ready: !enabled || token !== null, token: token ?? undefined,
    widget: enabled ? <CaptchaBox key={round} onToken={setToken} /> : null,
    reset: () => { if (enabled) { setToken(null); setRound((r) => r + 1); } },
  };
}
