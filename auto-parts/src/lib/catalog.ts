import { env } from "@/lib/env";

// ثوابت الكتالوج المشتركة. القيم تطابق أنواع قاعدة البيانات.
export const partTypes = ["genuine", "aftermarket", "used", "refurbished"] as const;
export type PartType = (typeof partTypes)[number];
export const identifierKinds = ["oem", "manufacturer", "supplier", "alternative"] as const;
export type IdentifierKind = (typeof identifierKinds)[number];
export const availabilityStatuses = ["available", "out_of_stock", "on_request"] as const;
export const offerStatuses = ["draft", "active", "paused"] as const;
export const currencies = ["SAR", "USD", "CNY", "AED"] as const;
export const PAGE_SIZE = 24;

export type Named = { name_ar: string; name_en: string; name_zh: string };
export function localName(row: Named, locale: string): string {
  return locale === "ar" ? row.name_ar : locale === "zh" ? row.name_zh : row.name_en;
}

export function isPartType(v: unknown): v is PartType {
  return typeof v === "string" && (partTypes as readonly string[]).includes(v);
}

// أرقام القطع: سطر لكل رقم، تُحفظ كما كُتبت (بلا ترجمة)، بحد 20 رقمًا و60 حرفًا للرقم.
export function parsePartNumbers(text: string): string[] {
  const seen = new Set<string>();
  for (const line of text.split(/[\r\n,،]+/)) {
    const v = line.trim();
    if (v.length >= 2 && v.length <= 60) seen.add(v);
  }
  return [...seen].slice(0, 20);
}

export function productImageUrl(path: string): string {
  return `${env.supabaseUrl}/storage/v1/object/public/ap-product-media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

const imageSignatures: { mime: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x) },
  {
    mime: "image/webp",
    ext: "webp",
    test: (b) => String.fromCharCode(...b.subarray(0, 4)) === "RIFF" && String.fromCharCode(...b.subarray(8, 12)) === "WEBP",
  },
];

export function sniffImage(head: Uint8Array): { mime: string; ext: string } | null {
  return imageSignatures.find((s) => head.length >= 12 && s.test(head)) ?? null;
}

export function formatMoney(amount: number | string, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : locale, { style: "currency", currency }).format(Number(amount));
}
