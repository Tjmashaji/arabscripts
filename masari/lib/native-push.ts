import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/lib/supabase";
import { pushOpened } from "@/lib/push-open";

// إشعارات الجوال الأصلية في تطبيق مساري (Capacitor): أندرويد عبر Firebase (FCM)، والآيفون عبر Apple (APNs) مباشرة.
// رمز الجهاز يُحفظ في device_tokens بنفس جدول Web Push: endpoint = الرمز، وplatform = "fcm" أو "apns"،
// فتعرف دالة push أي طريق ترسل به. تصل التنبيهات والتطبيق مغلق.

export type NativePushState = "on" | "off" | "denied";
const TOKEN_KEY = "masari-native-push-token";
const CHANNEL_ID = "trips"; // قناة أندرويد بأولوية عالية؛ ترسل إليها دالة push

export const isNativePush = () => Capacitor.isNativePlatform();
const platform = () => (Capacitor.getPlatform() === "ios" ? "apns" : "fcm");
const storedToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };

let listening = false;
let waiting: { resolve: (token: string) => void; reject: (e: Error) => void } | null = null;

async function saveToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* محجوب */ }
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;
  await supabase.from("device_tokens").upsert({ user_id: userId, endpoint: token, platform: platform(), p256dh: null, auth_key: null }, { onConflict: "endpoint" });
}

// لمس الإشعار يفتح الصفحة المناسبة؛ يُسجَّل مبكرًا لأن التطبيق قد يُفتح من الإشعار نفسه
if (Capacitor.isNativePlatform()) {
  void PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
    const t = (a.notification.data as { type?: unknown } | undefined)?.type;
    pushOpened(typeof t === "string" ? t : null);
  });
}

function listen() {
  if (listening) return;
  listening = true;
  void PushNotifications.addListener("registration", (t) => {
    void saveToken(t.value).then(() => { waiting?.resolve(t.value); waiting = null; });
  });
  void PushNotifications.addListener("registrationError", (e) => { waiting?.reject(new Error(e.error)); waiting = null; });
}

async function registerAndWait(): Promise<string> {
  listen();
  if (Capacitor.getPlatform() === "android") {
    await PushNotifications.createChannel({ id: CHANNEL_ID, name: "تنبيهات الرحلة", description: "بدء الرحلة واقتراب الباص وصعود الطالب ووصوله", importance: 5, visibility: 1, vibration: true });
  }
  const token = new Promise<string>((resolve, reject) => {
    waiting = { resolve, reject };
    setTimeout(() => { if (waiting) { waiting.reject(new Error("REGISTRATION_TIMEOUT")); waiting = null; } }, 20000);
  });
  await PushNotifications.register();
  return token;
}

export async function nativePushState(): Promise<NativePushState> {
  const { receive } = await PushNotifications.checkPermissions();
  if (receive === "denied") return "denied";
  return receive === "granted" && storedToken() ? "on" : "off";
}

export async function enableNativePush(): Promise<NativePushState> {
  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== "granted") return receive === "denied" ? "denied" : "off";
  await registerAndWait();
  const userId = (await supabase.auth.getSession()).data.session?.user.id;
  if (userId) await supabase.from("notification_preferences").upsert({ user_id: userId, push_enabled: true }, { onConflict: "user_id" });
  return "on";
}

export async function disableNativePush(): Promise<NativePushState> {
  await forgetNativePushToken();
  await PushNotifications.unregister().catch(() => {});
  return "off";
}

/** عند الدخول: إن كان الإذن ممنوحًا نجدّد الرمز (قد يتغير بعد تحديث التطبيق أو استعادته). */
export async function refreshNativePush() {
  if (!isNativePush()) return;
  const { receive } = await PushNotifications.checkPermissions();
  if (receive === "granted") await registerAndWait().catch(() => {});
}

/** قبل تسجيل الخروج: نحذف رمز هذا الجهاز حتى لا تصل تنبيهات الحساب السابق لمن يستخدم الجوال بعده. */
export async function forgetNativePushToken() {
  if (!isNativePush()) return;
  const token = storedToken();
  if (token) await supabase.from("device_tokens").delete().eq("endpoint", token);
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* محجوب */ }
}
