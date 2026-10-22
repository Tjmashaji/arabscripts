"use client";

import { useEffect } from "react";
import { registerPushToken } from "@/server/push-actions";
import { safeNextPath } from "@/lib/safe-redirect";

type Listener = { remove: () => void };
type PushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  createChannel?: (c: { id: string; name: string; importance: number }) => Promise<void>;
  addListener: (event: string, cb: (e: never) => void) => Promise<Listener>;
};
type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: { PushNotifications?: PushPlugin } };

// داخل تطبيق الجوال فقط (Capacitor): يطلب إذن الإشعارات بعد تسجيل الدخول، ويسجّل الجهاز للحساب،
// ويفتح الصفحة المرتبطة عند الضغط على الإشعار. في المتصفح لا يفعل شيئًا.
export function PushRegistrar({ channelName }: { channelName: string }) {
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
    const push = cap?.Plugins?.PushNotifications;
    if (!cap?.isNativePlatform?.() || !push) return;
    const platform = cap.getPlatform?.() === "ios" ? "ios" : "android";
    // نسخة أندرويد بلا إعداد Firebase تتعطل إن طلبت التسجيل؛ النسخ المهيأة تضيف ApPush لوكيل المستخدم (mobile/scripts/push-flag.mjs).
    if (platform === "android" && !navigator.userAgent.includes("ApPush")) return;
    const listeners: Promise<Listener>[] = [
      push.addListener("registration", ((t: { value: string }) => {
        registerPushToken(t.value, platform).catch(() => undefined);
      }) as (e: never) => void),
      push.addListener("pushNotificationActionPerformed", ((a: { notification?: { data?: { path?: unknown } } }) => {
        const path = safeNextPath(a.notification?.data?.path, "");
        if (path) window.location.href = path;
      }) as (e: never) => void),
    ];
    (async () => {
      if (platform === "android") await push.createChannel?.({ id: "default", name: channelName, importance: 4 }).catch(() => undefined);
      let { receive } = await push.checkPermissions();
      if (receive === "prompt" || receive === "prompt-with-rationale") ({ receive } = await push.requestPermissions());
      if (receive === "granted") await push.register();
    })().catch(() => undefined);
    return () => {
      listeners.forEach((l) => l.then((x) => x.remove()).catch(() => undefined));
    };
  }, [channelName]);
  return null;
}
