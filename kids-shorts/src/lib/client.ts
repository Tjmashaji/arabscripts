"use client";
// أدوات الواجهة للتواصل مع الـ API: رسائل خطأ عربية موحدة، ورفع بشريط تقدم، وجلب دوري.
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: opts.body === undefined ? undefined : { "content-type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "network", "تعذّر الاتصال بالخادم. تحقق من الإنترنت ثم حاول مجددًا.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") window.location.assign(new URL("/login", window.location.origin));
    throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? "حدث خطأ غير متوقع.", data?.error?.details);
  }
  return data as T;
}

export function upload(url: string, file: Blob, onProgress: (pct: number) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: { error?: { message?: string; code?: string } } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data?.error?.code ?? "error", data?.error?.message ?? "فشل الرفع."));
    };
    xhr.onerror = () => reject(new ApiError(0, "network", "انقطع الاتصال أثناء الرفع."));
    xhr.send(file);
  });
}

// جلب بيانات مع تحديث دوري اختياري (للمهام الجارية): يُعاد الجلب بعد كل تغيّر طالما دالة الاستطلاع تعيد مدة
export function useData<T>(path: string | null, pollMs?: (d: T | undefined) => number | null) {
  const [state, setState] = useState<{ data?: T; error: ApiError | null; loading: boolean; path: string | null }>({ error: null, loading: true, path });
  const [nonce, setNonce] = useState(0);
  const pollRef = useRef(pollMs);
  useEffect(() => {
    pollRef.current = pollMs;
  });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api<T>(path).then(
      (d) => alive && setState({ data: d, error: null, loading: false, path }),
      (e: ApiError) => alive && setState((s) => ({ ...s, error: e, loading: false, path })),
    );
    return () => {
      alive = false;
    };
  }, [path, nonce]);
  useEffect(() => {
    const ms = pollRef.current?.(state.data);
    if (!ms) return;
    const t = setTimeout(() => setNonce((n) => n + 1), ms);
    return () => clearTimeout(t);
  }, [state.data]);
  // إعادة تحميل يدوية تعيد البيانات الجديدة لمن ينتظرها
  const reload = useCallback(async () => {
    if (!path) return undefined;
    try {
      const d = await api<T>(path);
      setState({ data: d, error: null, loading: false, path });
      return d;
    } catch (e) {
      setState((s) => ({ ...s, error: e as ApiError, loading: false }));
      return undefined;
    }
  }, [path]);
  const setData = useCallback((d: T) => setState((s) => ({ ...s, data: d })), []);
  // بيانات مسار سابق لا تُعرض لمسار جديد
  const fresh = state.path === path;
  return { data: fresh ? state.data : undefined, error: fresh ? state.error : null, loading: !fresh || state.loading, reload, setData };
}
