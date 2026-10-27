// إعدادات المنصة القابلة للتعديل من /admin/settings وقواعد التحقق منها (مشتركة بين الصفحة والخادم والاختبارات).
export const numericSettings = {
  service_fee_percent: { min: 0, max: 50, integer: false },
  availability_max_age_hours: { min: 1, max: 720, integer: true },
  // مساعد التعبئة الذكي: حصة كل مستخدم وسقف المنصة خلال 24 ساعة (0 = إيقاف المساعد).
  ai_daily_user_limit: { min: 0, max: 500, integer: true },
  ai_daily_total_limit: { min: 0, max: 20000, integer: true },
} as const;

// بيانات الجهة المشغّلة: تظهر في التذييل وصفحة «من نحن» فقط إذا أُدخلت (لا بيانات افتراضية أو وهمية).
export const textSettings = {
  legal_entity_name: (v: string) => v.length >= 2 && v.length <= 200,
  commercial_register: (v: string) => /^[0-9]{10}$/.test(v),
  contact_email: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 200,
  contact_whatsapp: (v: string) => /^\+[1-9][0-9]{7,14}$/.test(v),
  // بيانات التحويل البنكي: تظهر للعميل على الطلب بانتظار الدفع (الآيبان شرط ظهورها).
  bank_name: (v: string) => v.length >= 2 && v.length <= 120,
  bank_account_name: (v: string) => v.length >= 2 && v.length <= 200,
  bank_iban: (v: string) => /^SA[0-9]{22}$/.test(v),
} as const;

export const paymentSettings = ["bank_name", "bank_account_name", "bank_iban"] as const;

// الآيبان يُكتب عادة بمسافات وحروف صغيرة؛ يُحفظ بصيغة واحدة.
function normalizeText(key: string, value: string): string {
  return key === "bank_iban" ? value.replace(/\s+/g, "").toUpperCase() : value;
}

export type NumericSetting = keyof typeof numericSettings;
export type TextSetting = keyof typeof textSettings;
export const editableSettings = [...Object.keys(numericSettings), ...Object.keys(textSettings)] as (NumericSetting | TextSetting)[];

// القيمة المحفوظة (jsonb) أو null إن كانت غير صالحة. النص الفارغ يمسح الإعداد النصي.
export function parseSetting(key: string, raw: string): number | string | null {
  const value = raw.trim();
  if (key in numericSettings) {
    const rule = numericSettings[key as NumericSetting];
    if (!/^\d+(\.\d+)?$/.test(value)) return null;
    const n = Number(value);
    return n >= rule.min && n <= rule.max && (!rule.integer || Number.isInteger(n)) ? n : null;
  }
  if (key in textSettings) {
    if (value === "") return "";
    const text = normalizeText(key, value);
    return textSettings[key as TextSetting](text) ? text : null;
  }
  return null;
}

export type PublicSettings = Record<TextSetting, string>;

export function whatsappLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}
