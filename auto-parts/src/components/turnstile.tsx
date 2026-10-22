"use client";

import { useEffect, useRef } from "react";

// تحقق Cloudflare Turnstile داخل النموذج: يضيف حقلًا مخفيًا cf-turnstile-response يمرره الخادم إلى Supabase Auth
// (captchaToken)، وSupabase يتحقق منه بالمفتاح السري المحفوظ في لوحته. بلا مفتاح الموقع لا يظهر شيء.
type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => { loading = null; reject(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return loading;
}

const languages: Record<string, string> = { ar: "ar", en: "en", zh: "zh-cn" };

export function Turnstile({ siteKey, locale, action }: { siteKey: string | null; locale: string; action: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!siteKey || !ref.current) return;
    let id: string | null = null;
    let cancelled = false;
    const el = ref.current;
    loadTurnstile().then((api) => {
      if (!cancelled) id = api.render(el, { sitekey: siteKey, action, language: languages[locale] ?? "auto", size: "flexible" });
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey, locale, action]);
  return siteKey ? <div ref={ref} className="min-h-[65px]" /> : null;
}
