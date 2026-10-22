// قواعد طلب التوثيق، مشتركة بين النموذج والخادم والاختبارات.

export const VERIFICATION_KINDS = {
  commercial_register: { name: "سجل تجاري", hint: "10 أرقام، مثل 1010123456 أو الرقم الموحد 7xxxxxxxxx" },
  freelance: { name: "وثيقة عمل حر", hint: "رقم الوثيقة مثل FL-123456789" },
  maroof: { name: "منصة معروف", hint: "رقم المتجر في معروف" },
} as const;
export type VerificationKind = keyof typeof VERIFICATION_KINDS;

const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

// يعيد الرقم بصيغته الموحدة، أو null إذا كان غير صالح
export function normalizeVerificationNumber(kind: VerificationKind, raw: string): string | null {
  const s = toLatinDigits(raw).trim().replace(/\s+/g, "");
  if (kind === "commercial_register") return /^[1-7]\d{9}$/.test(s) ? s : null;
  if (kind === "freelance") {
    const m = s.toUpperCase().match(/^(?:FL)?-?(\d{6,12})$/);
    return m ? `FL-${m[1]}` : null;
  }
  return /^\d{3,10}$/.test(s) ? s : null;
}

export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

// النوع من أول بايتات الملف، لا من الاسم ولا مما يرسله المتصفح
export function sniffDocument(bytes: Uint8Array): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export const safeFileName = (name: string) =>
  (name.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]+/gu, "_").replace(/^[.\s]+/, "").slice(0, 120) || "document");
