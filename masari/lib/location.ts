import { Capacitor, registerPlugin } from "@capacitor/core";

// موقع الجهاز: في تطبيق الجوال (Capacitor) نستخدم إضافة الموقع في الخلفية، فيستمر إرسال موقع الباص
// والشاشة مطفأة أو التطبيق مصغّر (مع إشعار دائم «رحلة جارية» كما يشترط أندرويد).
// في المتصفح نستخدم Geolocation العادي، وهو يتوقف إذا أُطفئت الشاشة.

export type Fix = { lat: number; lng: number; accuracy: number; speed: number | null; heading: number | null };
type NativeLocation = { latitude: number; longitude: number; accuracy: number; speed: number | null; bearing: number | null };
type NativeError = { code?: string; message?: string };
type BackgroundGeolocationPlugin = {
  addWatcher(options: { backgroundMessage?: string; backgroundTitle?: string; requestPermissions?: boolean; stale?: boolean; distanceFilter?: number },
    callback: (location?: NativeLocation, error?: NativeError) => void): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
};
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");

export const isNativeApp = () => Capacitor.isNativePlatform();

const fromBrowser = (p: GeolocationPosition): Fix => ({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, speed: p.coords.speed, heading: p.coords.heading });

/** يبدأ متابعة الموقع ويعيد دالة الإيقاف. */
export async function watchLocation(onFix: (fix: Fix) => void, onError: (message: string) => void): Promise<() => void> {
  if (isNativeApp()) {
    const id = await BackgroundGeolocation.addWatcher({
      backgroundTitle: "رحلة جارية — مساري",
      backgroundMessage: "يرسل التطبيق موقع الباص لأولياء الأمور حتى تنتهي الرحلة.",
      requestPermissions: true, stale: false, distanceFilter: 10,
    }, (location, error) => {
      if (error) {
        onError(error.code === "NOT_AUTHORIZED" ? "اسمح لمساري بالوصول إلى الموقع من إعدادات الجوال، ثم ابدأ الرحلة مرة أخرى." : "تعذر قراءة الموقع من الجوال.");
        if (error.code === "NOT_AUTHORIZED") void BackgroundGeolocation.openSettings().catch(() => {});
        return;
      }
      if (location) onFix({ lat: location.latitude, lng: location.longitude, accuracy: location.accuracy, speed: location.speed, heading: location.bearing });
    });
    return () => { void BackgroundGeolocation.removeWatcher({ id }).catch(() => {}); };
  }
  if (!("geolocation" in navigator)) { onError("هذا الجهاز لا يدعم تحديد الموقع من المتصفح."); return () => {}; }
  navigator.geolocation.getCurrentPosition((p) => onFix(fromBrowser(p)), () => onError("لم يتم السماح بالموقع. استخدم إعدادات المتصفح لتفعيل GPS."), { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
  const watchId = navigator.geolocation.watchPosition((p) => onFix(fromBrowser(p)), () => onError("تعذر تحديث GPS الآن. تحقق من إذن الموقع والإنترنت."), { enableHighAccuracy: true, timeout: 18000, maximumAge: 15000 });
  return () => navigator.geolocation.clearWatch(watchId);
}

/** قراءة واحدة للموقع (زر «تحديث الموقع الآن»). */
export function locateOnce(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) { reject(new Error("NO_GEOLOCATION")); return; }
    navigator.geolocation.getCurrentPosition((p) => resolve(fromBrowser(p)), reject, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });
}
