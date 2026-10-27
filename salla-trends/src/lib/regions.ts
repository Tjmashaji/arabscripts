import { normalizeText } from "./normalize";

// مناطق المملكة الثلاث عشرة، ثم دول الخليج والجوار التي يشحن لها تجار سلة غالبًا.
// المدن المذكورة هي الأكثر ورودًا في عناوين الشحن؛ المدينة غير المعروفة تدخل في «الكل» فقط.
export const REGIONS = [
  { code: "RIYADH", name: "منطقة الرياض", cities: ["الرياض", "riyadh", "الخرج", "kharj", "al kharj", "الدوادمي", "المجمعه", "majmaah", "الزلفي", "zulfi", "وادي الدواسر", "عفيف", "القويعيه", "شقراء", "الدرعيه", "diriyah", "حوطه بني تميم", "الافلاج", "المزاحميه", "الدلم", "ضرما", "رماح", "السليل", "ثادق", "حريملاء"] },
  { code: "MAKKAH", name: "منطقة مكة المكرمة", cities: ["مكه", "مكه المكرمه", "makkah", "mecca", "makka", "جده", "jeddah", "jiddah", "jedda", "الطائف", "taif", "رابغ", "rabigh", "القنفذه", "الليث", "خليص", "الجموم", "الخرمه", "رنيه", "تربه", "ثول", "بحره"] },
  { code: "MADINAH", name: "منطقة المدينة المنورة", cities: ["المدينه", "المدينه المنوره", "madinah", "medina", "madina", "ينبع", "yanbu", "العلا", "alula", "al ula", "بدر", "المهد", "الحناكيه", "خيبر"] },
  { code: "EASTERN", name: "المنطقة الشرقية", cities: ["الدمام", "dammam", "الخبر", "khobar", "al khobar", "الظهران", "dhahran", "الاحساء", "الحساء", "ahsa", "al ahsa", "الهفوف", "hofuf", "المبرز", "الجبيل", "jubail", "القطيف", "qatif", "حفر الباطن", "hafar al batin", "الخفجي", "khafji", "راس تنوره", "بقيق", "abqaiq", "النعيريه", "سيهات", "صفوى", "تاروت", "القريه العليا"] },
  { code: "QASSIM", name: "منطقة القصيم", cities: ["بريده", "buraydah", "buraidah", "عنيزه", "unaizah", "onaizah", "الرس", "rass", "ar rass", "البكيريه", "المذنب", "البدائع", "رياض الخبراء", "الاسياح"] },
  { code: "ASIR", name: "منطقة عسير", cities: ["ابها", "abha", "خميس مشيط", "khamis mushait", "khamis mushayt", "بيشه", "bisha", "محايل", "محايل عسير", "النماص", "احد رفيده", "سراه عبيده", "ظهران الجنوب", "رجال المع", "تثليث"] },
  { code: "TABUK", name: "منطقة تبوك", cities: ["تبوك", "tabuk", "الوجه", "ضباء", "duba", "تيماء", "املج", "حقل"] },
  { code: "HAIL", name: "منطقة حائل", cities: ["حائل", "حايل", "hail", "ha'il", "بقعاء", "الغزاله", "الشنان"] },
  { code: "NORTHERN_BORDERS", name: "منطقة الحدود الشمالية", cities: ["عرعر", "arar", "رفحاء", "rafha", "طريف", "turaif", "العويقيله"] },
  { code: "JAZAN", name: "منطقة جازان", cities: ["جازان", "جيزان", "jazan", "jizan", "gizan", "صبيا", "sabya", "ابو عريش", "abu arish", "صامطه", "بيش", "الدرب", "احد المسارحه"] },
  { code: "NAJRAN", name: "منطقة نجران", cities: ["نجران", "najran", "شروره", "sharurah", "حبونا", "بدر الجنوب"] },
  { code: "BAHA", name: "منطقة الباحة", cities: ["الباحه", "baha", "al baha", "بلجرشي", "المندق", "المخواه", "العقيق", "قلوه"] },
  { code: "JOUF", name: "منطقة الجوف", cities: ["سكاكا", "sakaka", "الجوف", "jouf", "al jouf", "دومه الجندل", "القريات", "qurayyat", "طبرجل"] },
  { code: "AE", name: "الإمارات", cities: [] },
  { code: "KW", name: "الكويت", cities: [] },
  { code: "QA", name: "قطر", cities: [] },
  { code: "BH", name: "البحرين", cities: [] },
  { code: "OM", name: "عُمان", cities: [] },
] as const;

export type RegionCode = (typeof REGIONS)[number]["code"];

export const REGION_NAMES: Record<string, string> = Object.fromEntries(REGIONS.map((r) => [r.code, r.name]));
export const regionName = (code: string) => (code === "ALL" ? "كل المناطق" : (REGION_NAMES[code] ?? code));

const COUNTRY_ALIASES: Record<string, string> = {
  sa: "SA", sau: "SA", ksa: "SA", "saudi arabia": "SA", "السعوديه": "SA", "المملكه العربيه السعوديه": "SA",
  ae: "AE", are: "AE", uae: "AE", "united arab emirates": "AE", "الامارات": "AE", "الامارات العربيه المتحده": "AE",
  kw: "KW", kwt: "KW", kuwait: "KW", "الكويت": "KW",
  qa: "QA", qat: "QA", qatar: "QA", "قطر": "QA",
  bh: "BH", bhr: "BH", bahrain: "BH", "البحرين": "BH",
  om: "OM", omn: "OM", oman: "OM", "عمان": "OM", "سلطنه عمان": "OM",
};

export function countryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = normalizeText(raw);
  return COUNTRY_ALIASES[key] ?? (/^[a-z]{2}$/.test(key) ? key.toUpperCase() : null);
}

const cityKey = (s: string) =>
  normalizeText(s)
    .split(" ")
    .map((t) => (t.startsWith("ال") && t.length >= 4 ? t.slice(2) : t))
    .filter((t) => t && t !== "al" && t !== "ar" && t !== "مدينه" && t !== "city")
    .join(" ");

// «المدينه» وحدها كلمة عامة بعد الحذف، فنبقيها مدخلًا خاصًا
const CITY_INDEX: { key: string[]; region: RegionCode }[] = REGIONS.flatMap((r) =>
  r.cities.map((c) => ({ key: (cityKey(c) || "مدينه").split(" "), region: r.code })),
).sort((a, b) => b.key.length - a.key.length);

export function regionFor(city: string | null | undefined, country: string | null | undefined): string | null {
  const cc = countryCode(country) ?? (city ? "SA" : null);
  if (!cc) return null;
  if (cc !== "SA") return REGIONS.some((r) => r.code === cc) ? cc : null;
  if (!city) return null;
  const raw = cityKey(city);
  const t = (raw || "مدينه").split(" ");
  // يكفي أن تبدأ المدينة بالاسم المعروف: «جده - حي الصفا» → مكة
  for (const { key, region } of CITY_INDEX) {
    if (key.every((k, i) => t[i] === k)) return region;
  }
  return null;
}
