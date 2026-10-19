// ثوابت الشركاء المشتركة بين الواجهة والخادم. القيم تطابق أنواع قاعدة البيانات (ap_capability وغيرها).
export const capabilities = ["broker", "seller", "supplier", "manufacturer", "carrier"] as const;
export type Capability = (typeof capabilities)[number];

export const applicationStatuses = [
  "draft_application", "submitted_for_review", "under_review", "changes_requested", "resubmitted", "approved", "rejected", "suspended",
] as const;
export type ApplicationStatus = (typeof applicationStatuses)[number];

export const documentTypes = [
  "commercial_register", "business_license", "authorization_letter", "brand_authorization", "product_catalog",
  "certificate", "source_invoice", "insurance", "transport_license", "other",
] as const;

export const applicationFields = [
  "legal_name", "trade_name", "entity_type", "country_code", "registered_address", "operating_country", "website",
  "activity_description", "billing_currency", "contact_name", "contact_title", "contact_phone", "contact_email",
  "languages", "capabilities", "documents", "declaration",
] as const;

export const editableStatuses: readonly ApplicationStatus[] = ["draft_application", "changes_requested"];
export const reviewableStatuses: readonly ApplicationStatus[] = ["submitted_for_review", "under_review", "resubmitted"];

export const countries = ["SA", "CN", "AE", "KW", "QA", "BH", "OM", "EG", "JO", "HK", "TW", "KR", "JP", "TR", "IN", "DE", "US"] as const;

export function isCapability(v: unknown): v is Capability {
  return typeof v === "string" && (capabilities as readonly string[]).includes(v);
}

// حدّ الرفع أقل من حد Vercel لجسم الطلب (4.5 ميجابايت).
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const signatures: { mime: string; ext: string; bytes: number[] }[] = [
  { mime: "application/pdf", ext: "pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  { mime: "image/png", ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
];

// نوع الملف يُحدَّد من محتواه (البايتات الأولى) لا من اسمه أو مما يرسله المتصفح.
export function sniffDocument(head: Uint8Array): { mime: string; ext: string } | null {
  for (const s of signatures) {
    if (s.bytes.every((b, i) => head[i] === b)) return { mime: s.mime, ext: s.ext };
  }
  return null;
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\\/:*?"<>|]+/g, "_").trim();
  return (cleaned || "file").slice(0, 200);
}
