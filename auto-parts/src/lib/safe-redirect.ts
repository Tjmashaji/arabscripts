// يقبل مسارًا داخليًا فقط، حتى لا يُستغل ?next= لتحويل المستخدم إلى موقع خارجي بعد الدخول.
export function safeNextPath(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(value)) return fallback;
  // لا مقاطع فارغة في المسار (//): بعد حذف بادئة اللغة (/en//evil.com ← //evil.com) تصبح رابطًا خارجيًا.
  if (/\/\//.test(value.split(/[?#]/)[0])) return fallback;
  return value;
}

// يزيل بادئة اللغة من المسار (/en/account → /account) حتى يُعاد بناؤه بلغة المستخدم المفضلة.
export function stripLocalePrefix(path: string, locales: readonly string[]): string {
  const match = path.match(/^\/([a-z]{2,3})(?=\/|$)/);
  if (match && locales.includes(match[1])) {
    const rest = path.slice(match[0].length) || "/";
    // حماية ثانية: الناتج يجب أن يبقى مسارًا داخليًا حتى لو تجاوز المدخل الفحص السابق.
    return rest.startsWith("//") || rest.startsWith("/\\") ? "/" : rest;
  }
  return path;
}
