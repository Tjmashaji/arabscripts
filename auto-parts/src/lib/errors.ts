import { getTranslations } from "next-intl/server";

// رسالة خطأ مترجمة من رمز ?error=. الرموز المعروفة في errors؛ غير المعروف يظهر رسالة عامة،
// فلا يُعرض نص من الرابط في الصفحة (رابط مصنوع لا يضع رسالة مضللة باسم المنصة).
export async function errorMessage(code: string): Promise<string> {
  const t = await getTranslations("errors");
  const key = code.replace(/[^a-z_]/gi, "");
  return key && t.has(key) ? t(key) : t("generic");
}
