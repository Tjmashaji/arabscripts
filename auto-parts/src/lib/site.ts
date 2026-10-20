// إعدادات المنصة القابلة للتعديل من /admin/settings وقواعد التحقق منها (مشتركة بين الصفحة والخادم والاختبارات).
export const numericSettings = {
  service_fee_percent: { min: 0, max: 50, integer: false },
  availability_max_age_hours: { min: 1, max: 720, integer: true },
} as const;

// بيانات الجهة المشغّلة: تظهر في التذييل وصفحة «من نحن» فقط إذا أُدخلت (لا بيانات افتراضية أو وهمية).
export const textSettings = {
  legal_entity_name: (v: string) => v.length >= 2 && v.length <= 200,
  commercial_register: (v: string) => /^[0-9]{10}$/.test(v),
  contact_email: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 200,
  contact_whatsapp: (v: string) => /^\+[1-9][0-9]{7,14}$/.test(v),
} as const;

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
    return textSettings[key as TextSetting](value) ? value : null;
  }
  return null;
}

export type PublicSettings = Record<TextSetting, string>;

export function whatsappLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}
