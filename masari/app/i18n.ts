"use client";

// واجهة إنجليزية للسائقين غير الناطقين بالعربية: مترجم خفيف يستبدل النصوص المعروفة في الصفحة
// (القوائم وشاشة السائق وفحص الباص والحساب) ويقلب اتجاه الصفحة. العربية تبقى الأصل في الكود،
// وأي نص غير موجود في القاموس يظهر كما هو.

export type Lang = "ar" | "en";
const KEY = "masari-lang";

const EN: Record<string, string> = {
  // القوائم والأدوار
  "نظرة عامة": "Overview", "نظرة على المنطقة": "Region overview", "دليل المدارس": "Schools", "برج المراقبة": "Control tower", "التقارير": "Reports",
  "المستخدمون والصلاحيات": "Users & roles", "الاشتراكات والفواتير": "Subscriptions & invoices", "إدارة البيانات": "Data", "سجل التدقيق": "Audit log", "الأعطال": "Errors",
  "نداء البوابة": "Gate calls", "الطلبات": "Requests", "الطلاب": "Students", "الباصات والسائقون": "Buses & drivers", "المسارات": "Routes", "رحلات اليوم": "Today's trips",
  "المحادثات": "Chats", "المحادثة": "Chat", "رسوم النقل": "Transport fees", "فريق المدرسة": "School team", "اشتراك مساري": "Masari plan", "ملاحظات أولياء الأمور": "Parent feedback",
  "أبنائي": "My children", "سجل الرحلات": "Trip history", "النداء والتصاريح": "Pickup & permissions", "المواقع": "Locations", "حسابي": "My account", "رحلة اليوم": "Today's trip",
  "الإدارة التنفيذية": "Executive", "إدارة المدرسة": "School admin", "السائق": "Driver", "ولي الأمر": "Parent", "مدير النظام": "System admin",
  "خروج": "Sign out", "تسجيل الخروج": "Sign out", "الإشعارات": "Notifications", "جلسة فعلية": "Live session", "مساري": "Masari", "إدارة النقل المدرسي": "School transport",
  "تحتاج مساعدة؟": "Need help?", "تواصل معنا": "Contact us", "تواصل مع إدارة مساري": "Contact Masari support", "المزيد": "More", "لا توجد إشعارات بعد.": "No notifications yet.",
  // شاشة السائق
  "مسارك اليوم": "Your route today", "الرحلة الصباحية": "Morning trip", "رحلة العودة": "Return trip", "انتهت رحلة اليوم": "Today's trip is done",
  "إنهاء الرحلة": "End trip", "بدء الرحلة وتفعيل الموقع": "Start trip & enable location", "GPS فعّال الآن": "GPS is active",
  "الرحلة بدأت والموقع غير متاح": "Trip started, location unavailable", "اسمح للموقع من إعدادات المتصفح، ثم اضغط تحديث GPS": "Allow location in settings, then tap Refresh GPS",
  "اعتماد محطة الوصول": "Confirm arrival at stop", "تم اعتماد كل المحطات": "All stops confirmed", "فعّل GPS لاعتماد المحطة": "Enable GPS to confirm the stop",
  "لا يمكن الاعتماد دون موقع GPS فعلي": "A real GPS fix is required", "تحديث GPS الآن": "Refresh GPS now", "GPS الجهاز": "Device GPS", "تم التقاط موقع السائق": "Driver location captured",
  "بانتظار السماح بالموقع": "Waiting for location permission", "اضغط بدء الرحلة وسيطلب المتصفح إذن الموقع.": "Tap Start trip and allow location access.",
  "المحطة الحالية": "Current stop", "تسلسل الرحلة": "Trip sequence", "نقاط التوقف": "Stops", "خريطة المسار": "Route map", "متابعة الرحلة": "Trip progress", "اكتملت الرحلة": "Trip completed",
  "الملاحة إلى المحطة التالية": "Navigate to next stop", "المسار كاملًا في خرائط Google": "Full route in Google Maps", "المسار كامل": "Fit route", "تتبع الباص": "Follow bus", "يتتبع الباص": "Following bus",
  "مسح بطاقة طالب": "Scan student card", "ابدأ الرحلة لتفعيل مسح البطاقات": "Start the trip to scan cards", "تصوير البطاقة": "Photograph card", "إرسال بلاغ طارئ": "Send emergency report",
  "لا يوجد طلاب في هذه الرحلة.": "No students on this trip.", "طالب واحد": "1 student", "موقع المدرسة": "School location", "موقع المنزل": "Home location",
  "صعد": "Boarded", "نزل": "Dropped off", "لم يحضر": "No show", "لم يصعد": "Not boarded", "الباص قادم": "Bus coming", "في الباص": "On bus", "وصل المدرسة": "At school",
  "غائب": "Absent", "وصل المنزل": "Home", "حالة طارئة": "Emergency", "مسجل في المسار": "On route", "الباص في الطريق": "Bus on the way", "بانتظار بدء الرحلة": "Waiting for trip",
  "الرحلة جارية": "Trip in progress", "لا توجد رحلة اليوم": "No trip today",
  "تم تسجيل صعود الطالب وإشعار ولي الأمر.": "Boarding recorded; parent notified.", "تم تسجيل نزول الطالب عند المنزل وإشعار ولي الأمر.": "Drop-off recorded; parent notified.",
  "تم تسجيل عدم حضور الطالب وإشعار ولي الأمر.": "No-show recorded; parent notified.",
  // فحص الباص
  "فحص الباص": "Bus check", "قبل أول رحلة اليوم": "Before the first trip today", "السلامة": "Safety", "الفرامل": "Brakes", "أحزمة الأمان": "Seat belts",
  "الأبواب ومخرج الطوارئ": "Doors & emergency exit", "طفاية الحريق": "Fire extinguisher", "حقيبة الإسعاف": "First-aid kit", "المكيف": "Air conditioning", "نظافة الباص": "Cleanliness",
  "سليم": "OK", "كل البنود سليمة": "All items OK", "حفظ الفحص": "Save check", "جارٍ الحفظ…": "Saving…", "ملاحظة": "Note", "الصورة": "Photo", "صورة للباص (اختياري)": "Bus photo (optional)",
  "(اختياري)": "(optional)", "(مطلوبة)": "(required)", "تم": "Done", "اكتب ملاحظة عن البند غير السليم.": "Describe the failed item.", "تعذر حفظ الفحص. حاول مرة أخرى.": "Could not save the check. Try again.",
  "مرّ على البنود وأزل العلامة عن أي بند غير سليم. لا تبدأ الرحلة قبل حفظ الفحص.": "Go through the items and untick anything not OK. Save the check before starting.",
  "لا توجد بيانات بعد": "Nothing here yet", "لا توجد رحلات مسندة إليك بعد. ستظهر رحلة اليوم بعد أن تسندك المدرسة إلى مسار.": "No trips assigned to you yet. Today's trip appears once the school assigns you to a route.",
  "بدء الرحلة": "Start trip", "الباص": "Bus", "المحطة التالية": "Next stop", "إجازة": "Holiday", "تسجيل الدخول بحساب آخر": "Sign in with another account",
  // الحساب
  "حذف الحساب": "Delete account", "حذف الحساب نهائيًا": "Delete account permanently", "احذف حسابي": "Delete my account", "إلغاء": "Cancel", "بيانات الدخول": "Sign-in details",
  "الخصوصية": "Privacy", "اللغة": "Language", "العربية": "العربية", "تسجيل الدخول": "Sign in", "البريد الإلكتروني": "Email", "كلمة المرور": "Password", "دخول": "Sign in",
};

// نصوص فيها أرقام أو أسماء
const PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^الرحلة الصباحية — (.+)$/, (n) => `Morning trip — ${n}`],
  [/^رحلة العودة — (.+)$/, (n) => `Return trip — ${n}`],
  [/^(\d+) محطات · (?:(\d+) طلاب|طالب واحد) · الباص (.+)$/, (s, n, b) => `${s} stops · ${n ?? 1} student${n && n !== "1" ? "s" : ""} · Bus ${b}`],
  [/^تبعد (\d+)م عن المحطة$/, (d) => `${d} m from the stop`],
  [/^اعتماد المحطة متاح داخل نطاق (\d+) متر فقط$/, (d) => `Stops can be confirmed within ${d} m only`],
  [/^آخر تحديث GPS بدقة (\d+) متر\.$/, (d) => `Last GPS update, accuracy ${d} m.`],
  [/^(\d+) عملية محفوظة على الجهاز بانتظار الإنترنت\. تابع رحلتك عاديًا\.$/, (n) => `${n} actions saved on the device, waiting for internet. Carry on.`],
  [/^أُرسلت (\d+) عملية محفوظة بعد عودة الإنترنت\.$/, (n) => `${n} saved actions sent after reconnecting.`],
  [/^باص (.+)$/, (n) => `Bus ${n}`],
];

const translate = (text: string): string | null => {
  const t = text.trim();
  if (!t || !/[؀-ۿ]/.test(t)) return null;
  const hit = EN[t];
  if (hit) return text.replace(t, hit);
  for (const [re, fn] of PATTERNS) { const m = t.match(re); if (m) return text.replace(t, fn(...m.slice(1))); }
  return null;
};

const ATTRS = ["placeholder", "aria-label", "title"];
const walk = (root: Node) => {
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    const next = translate(n.nodeValue ?? "");
    if (next !== null && next !== n.nodeValue) n.nodeValue = next;
  }
  if (root instanceof Element) {
    [root, ...Array.from(root.querySelectorAll("[placeholder],[aria-label],[title]"))].forEach((el) => ATTRS.forEach((a) => {
      const v = el.getAttribute(a); if (!v) return;
      const next = translate(v); if (next !== null && next !== v) el.setAttribute(a, next);
    }));
  }
};

let observer: MutationObserver | null = null;
export const getLang = (): Lang => { try { return localStorage.getItem(KEY) === "en" ? "en" : "ar"; } catch { return "ar"; } };

export function applyLang(lang: Lang = getLang()) {
  if (typeof document === "undefined") return;
  observer?.disconnect(); observer = null;
  const html = document.documentElement;
  html.lang = lang; html.dir = lang === "en" ? "ltr" : "rtl";
  if (lang !== "en") return;
  walk(document.body);
  observer = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") { const next = translate(m.target.nodeValue ?? ""); if (next !== null && next !== m.target.nodeValue) m.target.nodeValue = next; }
      else if (m.type === "attributes" && m.target instanceof Element) walk(m.target);
      else m.addedNodes.forEach((n) => walk(n));
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

export function setLang(lang: Lang) {
  try { localStorage.setItem(KEY, lang); } catch { /* محجوب */ }
  // العودة للعربية تتطلب إعادة رسم النصوص الأصلية
  if (lang === "ar") window.location.reload(); else applyLang("en");
}
