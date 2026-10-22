// توحيد النص العربي لمطابقة نفس المنتج بين متاجر تكتب اسمه بطرق مختلفة:
// «عطر العود الملكي ١٠٠ مل» و«عطر عود ملكي 100ml» يصلان إلى نفس البصمة.

const DIACRITICS = /[ً-ٰٟۖ-ۭـ]/g;
const LETTERS: Record<string, string> = {
  "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي", "ی": "ي", "ک": "ك", "گ": "ك",
};

const STOPWORDS = new Set(["من", "في", "مع", "على", "عن", "او", "و", "ل", "ب", "the", "a", "an", "of", "for", "with", "and", "or", "by", "new", "جديد"]);

// الوحدات تُلصق بالرقم قبلها: «100 مل» → «100ml»
const UNITS: [RegExp, string][] = [
  [/(\d+(?:\.\d+)?)\s*(?:ml|مل|ملي|مليلتر)(?![\p{L}])/gu, "$1ml"],
  [/(\d+(?:\.\d+)?)\s*(?:l|لتر)(?![\p{L}])/gu, "$1l"],
  [/(\d+(?:\.\d+)?)\s*(?:kg|كجم|كغ|كيلو|كيلوجرام)(?![\p{L}])/gu, "$1kg"],
  [/(\d+(?:\.\d+)?)\s*(?:g|gm|gr|جم|غ|جرام|غرام)(?![\p{L}])/gu, "$1g"],
  [/(\d+(?:\.\d+)?)\s*(?:pcs|pc|قطعه|قطع|حبه|حبات)(?![\p{L}])/gu, "$1pc"],
];

export function normalizeText(input: string): string {
  let s = input.normalize("NFKC").toLowerCase().replace(DIACRITICS, "");
  s = s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  s = s.replace(/[أإآٱةىؤئیکگ]/g, (c) => LETTERS[c] ?? c);
  s = s.replace(/[^\p{L}\p{N}.]+/gu, " ").replace(/(?<!\d)\.|\.(?!\d)/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

// كلمات تبدأ بـ«أل» أصلية وليست أداة تعريف («ألعاب»، «ألوان»)، وتتطابق كتابتها بعد توحيد الهمزة
const ROOT_AL = new Set(["العاب", "الوان", "الماس", "البوم", "الياف", "الواح"]);

function stripArticle(token: string): string {
  // «العطر» → «عطر»، مع ترك الكلمات القصيرة («الف»)
  if (ROOT_AL.has(token)) return token;
  if (token.startsWith("ال") && token.length >= 5) return token.slice(2);
  if (token.startsWith("بال") && token.length >= 6) return token.slice(3);
  return token;
}

export function tokens(input: string): string[] {
  let s = normalizeText(input);
  for (const [re, rep] of UNITS) s = s.replace(re, rep);
  return s
    .split(" ")
    .map(stripArticle)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

// GTIN-8/12/13/14 مع التحقق من رقم الفحص، حتى لا تُدمج منتجات بسبب باركود وهمي مثل 000000
export function validGtin(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(d.length) || /^0+$/.test(d) || /^(\d)\1+$/.test(d)) return null;
  const digits = d.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check ? d.padStart(14, "0") : null;
}

// البصمة: الباركود إن كان صالحًا، وإلا كلمات الاسم الموحدة مرتبة (فلا يهم ترتيب الكلمات)
export function fingerprint(name: string, gtin?: string | null): string | null {
  const g = validGtin(gtin);
  if (g) return `gtin:${g}`;
  const t = [...new Set(tokens(name))].sort().slice(0, 12);
  // اسم من كلمة واحدة («عطر») عام جدًا ليمثل منتجًا محددًا
  if (t.length < 2) return null;
  return `name:${t.join(" ")}`;
}
