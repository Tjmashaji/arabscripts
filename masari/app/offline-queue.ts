"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// وضع بدون إنترنت للسائق: ما يفشل بسبب انقطاع الشبكة (تسجيل الركوب والنزول، اعتماد المحطة، نقاط GPS)
// يُحفظ على الجهاز ويُرسل بالترتيب عند عودة الاتصال. الأخطاء غير الشبكية (صلاحية، رحلة منتهية…) لا تُعاد.

type NewItem = { kind: "rpc"; name: string; args: Record<string, unknown> } | { kind: "insert"; table: string; row: Record<string, unknown> };
type Item = NewItem & { id: string; at: string };
const KEY = "masari-offline-queue-v1";
const MAX = 600;
const listeners = new Set<() => void>();

const read = (): Item[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Item[]; } catch { return []; } };
const write = (items: Item[]) => { try { localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX))); } catch { /* التخزين ممتلئ أو محجوب */ } listeners.forEach((l) => l()); };

export const isNetworkError = (error: { message?: string } | null | undefined) =>
  (typeof navigator !== "undefined" && !navigator.onLine) || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(error?.message ?? "");

export function enqueue(item: NewItem) {
  write([...read(), { ...item, id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()), at: new Date().toISOString() }]);
}
export const pendingCount = () => read().length;

let flushing = false;
export async function flushQueue(): Promise<{ sent: number; dropped: number }> {
  if (flushing || (typeof navigator !== "undefined" && !navigator.onLine)) return { sent: 0, dropped: 0 };
  flushing = true;
  let sent = 0, dropped = 0;
  try {
    for (;;) {
      const [item] = read();
      if (!item) break;
      const { error } = item.kind === "rpc" ? await supabase.rpc(item.name, item.args) : await supabase.from(item.table).insert(item.row);
      if (error && isNetworkError(error)) break;
      if (error) dropped++; else sent++;
      write(read().filter((x) => x.id !== item.id));
    }
  } finally { flushing = false; }
  return { sent, dropped };
}

// عدد العناصر المنتظرة، مع إرسالها تلقائيًا عند عودة الشبكة وكل 30 ثانية.
// بعد كل إرسال ناجح يُطلق الحدث masari-queue-flushed ليعيد التطبيق تحميل بياناته.
export function useOfflineQueue() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const update = () => setCount(pendingCount());
    listeners.add(update);
    const run = () => { void flushQueue().then((r) => { update(); if (r.sent || r.dropped) window.dispatchEvent(new CustomEvent("masari-queue-flushed", { detail: r })); }); };
    window.addEventListener("online", run);
    const t = window.setInterval(run, 30000);
    run();
    return () => { listeners.delete(update); window.removeEventListener("online", run); window.clearInterval(t); };
  }, []);
  return count;
}
