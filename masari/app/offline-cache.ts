"use client";

// آخر بيانات ناجحة للسائق على الجهاز: إذا انقطع الإنترنت أثناء الرحلة وأُعيد فتح التطبيق
// تبقى رحلته ومحطاته وطلابه ظاهرة، بدل شاشة «لا توجد رحلات» أو «حسابك بانتظار التفعيل».
// كل شيء مربوط بحساب المستخدم، وبيانات الرحلة صالحة لليوم نفسه فقط، ويُمسح عند تسجيل الخروج.

export class OfflineError extends Error {
  constructor() { super("OFFLINE"); this.name = "OfflineError"; }
}

const ACCESS_KEY = "masari-access-cache-v1";
const DRIVER_KEY = "masari-driver-cache-v1";
type Entry<T> = { uid: string; day?: string; at: string; value: T };

function save<T>(key: string, entry: Entry<T>) {
  try { localStorage.setItem(key, JSON.stringify(entry)); } catch { /* التخزين ممتلئ أو محجوب */ }
}
function load<T>(key: string): Entry<T> | null {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") as Entry<T> | null; } catch { return null; }
}

export const cacheAccess = <T,>(uid: string, value: T) => save(ACCESS_KEY, { uid, at: new Date().toISOString(), value });
export const cachedAccess = <T,>(uid: string): T | null => { const e = load<T>(ACCESS_KEY); return e && e.uid === uid ? e.value : null; };

export const cacheDriverData = <T,>(uid: string, day: string, value: T) => save(DRIVER_KEY, { uid, day, at: new Date().toISOString(), value });
export const cachedDriverData = <T,>(uid: string, day: string): T | null => {
  const e = load<T>(DRIVER_KEY);
  return e && e.uid === uid && e.day === day ? e.value : null;
};

export function clearOfflineCache() {
  try { localStorage.removeItem(ACCESS_KEY); localStorage.removeItem(DRIVER_KEY); } catch { /* محجوب */ }
}
