import { tokens } from "./normalize";

// تصنيف موحد: كل متجر يسمي أقسامه بطريقته («العطور»، «عطورات»، «Perfumes»)، فنربطها بتصنيف واحد للمقارنة.
// الكلمات مكتوبة بصيغتها بعد التوحيد (بلا «ال»، والتاء المربوطة هاء).
export const TAXONOMY = [
  { code: "perfumes", name: "العطور والبخور", words: ["عطر", "عطور", "عطورات", "بخور", "عود", "دهن", "مسك", "perfume", "perfumes", "fragrance", "oud", "musk", "parfum", "معطر"] },
  { code: "beauty", name: "التجميل والعناية", words: ["مكياج", "تجميل", "عنايه", "بشره", "شعر", "كريم", "سيروم", "شامبو", "makeup", "beauty", "skincare", "skin", "hair", "serum", "cream", "lipstick", "روج", "ماسكرا", "مناكير", "رموش"] },
  { code: "fashion", name: "الأزياء والملابس", words: ["ملابس", "فستان", "فساتين", "عبايه", "عبايات", "ثوب", "ثياب", "قميص", "بنطلون", "جلابيه", "شماغ", "طرحه", "حجاب", "fashion", "dress", "abaya", "shirt", "clothes", "clothing", "hoodie", "جاكيت", "بيجامه", "احذيه", "حذاء", "شنطه", "شنط", "shoes", "bag"] },
  { code: "accessories", name: "الإكسسوارات والمجوهرات", words: ["اكسسوارات", "اكسسوار", "مجوهرات", "ساعه", "ساعات", "خاتم", "سوار", "قلاده", "عقد", "نظارات", "نظاره", "accessories", "jewelry", "watch", "ring", "necklace", "bracelet", "sunglasses", "ذهب", "فضه"] },
  { code: "electronics", name: "الإلكترونيات والجوالات", words: ["الكترونيات", "جوال", "جوالات", "سماعه", "سماعات", "شاحن", "كفر", "كفرات", "لابتوب", "ايفون", "سامسونج", "electronics", "phone", "iphone", "charger", "headphones", "earbuds", "airpods", "cable", "case", "laptop", "تابلت", "ipad", "باور", "بانك", "كيبل"] },
  { code: "home", name: "المنزل والمطبخ", words: ["منزل", "مطبخ", "اواني", "ديكور", "مفارش", "مفرش", "سجاد", "اناره", "home", "kitchen", "decor", "مخده", "كاسات", "فناجين", "دله", "ترامس", "ترمس", "تخزين", "منظم", "مبخره"] },
  { code: "food", name: "الأغذية والمشروبات", words: ["تمر", "تمور", "قهوه", "شاي", "عسل", "حلويات", "شوكولاته", "بهارات", "مكسرات", "coffee", "tea", "dates", "honey", "chocolate", "sweets", "food", "snacks", "بن"] },
  { code: "health", name: "الصحة والمكملات", words: ["صحه", "مكملات", "فيتامين", "فيتامينات", "بروتين", "اعشاب", "health", "vitamin", "vitamins", "supplement", "supplements", "protein", "كولاجين", "collagen", "اوميغا", "omega"] },
  { code: "kids", name: "الأطفال والألعاب", words: ["اطفال", "طفل", "العاب", "لعبه", "رضع", "مواليد", "kids", "baby", "toys", "toy", "children", "حفاضات"] },
  { code: "sports", name: "الرياضة واللياقة", words: ["رياضه", "رياضي", "رياضيه", "لياقه", "جيم", "sport", "sports", "fitness", "gym", "yoga", "يوغا", "دمبل", "دراجه"] },
  { code: "gifts", name: "الهدايا والمناسبات", words: ["هدايا", "هديه", "توزيعات", "مناسبات", "تغليف", "ورد", "gift", "gifts", "flowers", "بوكس", "box"] },
  { code: "auto", name: "السيارات", words: ["سيارات", "سياره", "car", "cars", "auto", "زيت", "اطارات"] },
  { code: "pets", name: "الحيوانات الأليفة", words: ["قطط", "قطه", "كلاب", "حيوانات", "pet", "pets", "cat", "dog"] },
  { code: "other", name: "أخرى", words: [] },
] as const;

export type TaxonomyCode = (typeof TAXONOMY)[number]["code"];
export const TAXONOMY_NAMES: Record<string, string> = Object.fromEntries(TAXONOMY.map((t) => [t.code, t.name]));
export const taxonomyName = (code: string) => (code === "ALL" ? "كل التصنيفات" : (TAXONOMY_NAMES[code] ?? code));

const WORD_INDEX = new Map<string, TaxonomyCode>();
for (const t of TAXONOMY) for (const w of t.words) if (!WORD_INDEX.has(w)) WORD_INDEX.set(w, t.code);

function vote(text: string): TaxonomyCode | null {
  const counts = new Map<TaxonomyCode, number>();
  for (const tok of tokens(text)) {
    const code = WORD_INDEX.get(tok);
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  let best: TaxonomyCode | null = null;
  let n = 0;
  for (const [code, c] of counts) if (c > n) [best, n] = [code, c];
  return best;
}

// أقسام المتجر أوضح من اسم المنتج، فنبدأ بها
export function classify(categoryNames: readonly string[], productName: string): TaxonomyCode {
  for (const c of categoryNames) {
    const code = vote(c);
    if (code) return code;
  }
  return vote(productName) ?? "other";
}
