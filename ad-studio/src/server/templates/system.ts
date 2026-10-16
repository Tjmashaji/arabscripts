// قوالب النظام الأولية. المتغيرات بين {{ }} تُملأ من بيانات النشاط فقط؛
// أي سطر يحتوي متغيرًا فارغًا (مثل العرض أو السعر) يُحذف بدل اختراع قيمة له.
export type TemplateSeed = {
  slug: string;
  name: string;
  description: string;
  preview: string;
  business_types: string[];
  goals: string[];
  styles: string[];
  durations: number[];
  platforms: string[];
  character_types: string[];
  scene_types: string[];
  required_fields: string[];
  base_prompt: string;
  negative_prompt: string;
  variables: { key: string; label: string; source: string }[];
  scene_plan: { title: string; duration_s: number; goal: string }[];
  editing_notes: string;
};

const VARS = [
  { key: "business_name", label: "اسم النشاط", source: "brand.name" },
  { key: "product", label: "المنتج أو الخدمة", source: "brand.description" },
  { key: "city", label: "المدينة", source: "brand.city" },
  { key: "offer", label: "العرض أو السعر", source: "brand.offer" },
  { key: "differentiator", label: "الميزة التنافسية", source: "brand.differentiator" },
  { key: "audience", label: "الجمهور", source: "brand.audience" },
  { key: "contact", label: "طريقة التواصل", source: "brand.contact" },
];
const NEG = "text, letters, subtitles, watermark, logo, distorted hands, extra fingers, blurry faces, low quality";

export const SYSTEM_TEMPLATES: TemplateSeed[] = [
  {
    slug: "restaurant-trendy-30",
    name: "إعلان مطعم ترندي",
    description: "خطاف سريع ثم أجواء ثم لقطات أكل مغرية وتقديم الوجبة، وينتهي بالدعوة للزيارة.",
    preview: "تدور مكان يضبط مزاجك؟ لحظة… شوف وش لقينا!",
    business_types: ["restaurant_cafe"],
    goals: ["attract_customers", "increase_visits", "increase_orders"],
    styles: ["trendy"],
    durations: [30],
    platforms: ["tiktok", "reels", "snapchat", "shorts"],
    character_types: ["narrator", "product_only"],
    scene_types: ["hook", "ambience", "food", "serving", "cta"],
    required_fields: ["business_name"],
    base_prompt: [
      "Trendy vertical restaurant ad for {{business_name}}.",
      "What they serve: {{product}}.",
      "Located in {{city}}.",
      "What makes them special: {{differentiator}}.",
      "Current offer to mention exactly as written: {{offer}}.",
      "Fast-paced, social-media native, appetizing close-ups, steam and sizzle, warm tones.",
    ].join("\n"),
    negative_prompt: NEG,
    variables: VARS,
    scene_plan: [
      { title: "خطاف بصري", duration_s: 4, goal: "scroll-stopping visual hook: a dramatic food or ambience moment" },
      { title: "أجواء المطعم", duration_s: 5, goal: "the restaurant ambience, lighting and seating" },
      { title: "لقطات الطعام", duration_s: 7, goal: "macro food shots: textures, crunch, juiciness" },
      { title: "تقديم الوجبة", duration_s: 8, goal: "the meal being served and enjoyed" },
      { title: "الشعار والدعوة", duration_s: 6, goal: "logo moment and invitation to visit" },
    ],
    editing_notes: "قطع على الإيقاع كل 1–2 ثانية في لقطات الطعام، ومؤثر صوتي للقرمشة والسيزلنغ.",
  },
  {
    slug: "specialty-coffee-15",
    name: "إعلان قهوة مختصة",
    description: "إعلان هادئ قصير يبرز طقوس التحضير وتفاصيل الكوب.",
    preview: "بعد يوم طويل… تستاهل كوبك.",
    business_types: ["restaurant_cafe"],
    goals: ["brand_awareness", "increase_visits"],
    styles: ["cinematic", "luxury"],
    durations: [15],
    platforms: ["reels", "tiktok", "shorts"],
    character_types: ["narrator", "product_only"],
    scene_types: ["ritual", "product", "cta"],
    required_fields: ["business_name"],
    base_prompt: "Cinematic specialty coffee ad for {{business_name}}.\nSignature: {{differentiator}}.\nSlow pours, latte art, steam, golden hour light, shallow depth of field.",
    negative_prompt: NEG,
    variables: VARS,
    scene_plan: [
      { title: "طقس التحضير", duration_s: 5, goal: "slow-motion espresso extraction and pour" },
      { title: "الكوب", duration_s: 6, goal: "hero shot of the cup on a table in warm light" },
      { title: "الدعوة", duration_s: 4, goal: "the café at golden hour and the logo" },
    ],
    editing_notes: "حركة بطيئة، موسيقى هادئة، انتقالات مزج.",
  },
  {
    slug: "luxury-perfume-30",
    name: "إعلان عطر فاخر",
    description: "صور فاخرة للزجاجة والمكونات بإيقاع بطيء وإضاءة درامية.",
    preview: "أثرٌ لا يُنسى.",
    business_types: ["perfume_beauty"],
    goals: ["product_launch", "brand_awareness", "increase_sales"],
    styles: ["luxury", "cinematic"],
    durations: [15, 30],
    platforms: ["reels", "youtube", "snapchat"],
    character_types: ["product_only", "narrator"],
    scene_types: ["mood", "product", "detail", "cta"],
    required_fields: ["business_name"],
    base_prompt: "Luxury perfume commercial for {{business_name}}.\nProduct: {{product}}.\nWhat makes it special: {{differentiator}}.\nDark velvet backgrounds, gold rim light, liquid macro, floating particles.",
    negative_prompt: NEG,
    variables: VARS,
    scene_plan: [
      { title: "المزاج", duration_s: 6, goal: "abstract luxurious mood: silk, smoke, light" },
      { title: "الزجاجة", duration_s: 9, goal: "hero reveal of the perfume bottle" },
      { title: "التفاصيل", duration_s: 9, goal: "macro details of the liquid and materials" },
      { title: "التوقيع", duration_s: 6, goal: "bottle with brand name space and call to action" },
    ],
    editing_notes: "حركة كاميرا بطيئة جدًا، موسيقى أوركسترالية خفيفة.",
  },
  {
    slug: "real-estate-cinematic-60",
    name: "إعلان عقاري سينمائي",
    description: "جولة سينمائية من الخارج للداخل مع إبراز المزايا الموجودة فعلًا في الوصف.",
    preview: "بيتك القادم… يبدأ من هنا.",
    business_types: ["real_estate"],
    goals: ["increase_sales", "product_launch"],
    styles: ["cinematic", "luxury", "documentary"],
    durations: [30, 60],
    platforms: ["youtube", "reels", "website"],
    character_types: ["narrator"],
    scene_types: ["aerial", "exterior", "interior", "amenities", "cta"],
    required_fields: ["business_name", "product"],
    base_prompt: "Cinematic real estate film for {{business_name}}.\nProperty: {{product}}.\nLocation: {{city}}.\nAdvantages: {{differentiator}}.\nPrice/offer exactly as written: {{offer}}.\nDrone establishing shots, smooth gimbal walkthroughs, natural daylight.",
    negative_prompt: NEG,
    variables: VARS,
    scene_plan: [
      { title: "لقطة جوية", duration_s: 8, goal: "aerial establishing shot of the area" },
      { title: "الواجهة", duration_s: 10, goal: "exterior of the property" },
      { title: "الداخل", duration_s: 18, goal: "interior walkthrough of living spaces" },
      { title: "المزايا", duration_s: 14, goal: "amenities that are mentioned in the brief" },
      { title: "الدعوة", duration_s: 10, goal: "sunset exterior and call to book a viewing" },
    ],
    editing_notes: "انتقالات ناعمة، لا تذكر مساحات أو أسعارًا غير مكتوبة في البيانات.",
  },
  {
    slug: "electronics-product-15",
    name: "إعلان منتج إلكتروني",
    description: "عرض سريع للمنتج وميزته الأساسية فقط.",
    preview: "صغير… لكنه يغيّر يومك.",
    business_types: ["ecommerce", "other"],
    goals: ["product_launch", "increase_sales"],
    styles: ["trendy", "direct_sale"],
    durations: [15],
    platforms: ["tiktok", "reels", "shorts", "snapchat"],
    character_types: ["product_only", "narrator"],
    scene_types: ["hook", "feature", "cta"],
    required_fields: ["business_name", "product"],
    base_prompt: "Sleek product ad for {{product}} sold by {{business_name}}.\nKey benefit: {{differentiator}}.\nOffer exactly as written: {{offer}}.\nClean studio, reflective surfaces, dynamic rotations.",
    negative_prompt: NEG,
    variables: VARS,
    scene_plan: [
      { title: "الخطاف", duration_s: 4, goal: "product reveal with a dynamic camera move" },
      { title: "الميزة", duration_s: 7, goal: "the product in use showing its main benefit" },
      { title: "الدعوة", duration_s: 4, goal: "product hero shot and call to order" },
    ],
    editing_notes: "إيقاع سريع، نصوص قصيرة جدًا.",
  },
  {
    slug: "fashion-store-30",
    name: "إعلان متجر ملابس",
    description: "لقطات أزياء متتابعة على الإيقاع مع إبراز التشكيلة.",
    preview: "إطلالتك الجديدة جاهزة.",
    business_types: ["fashion"],
    goals: ["attract_customers", "increase_sales", "product_launch"],
    styles: ["trendy", "luxury"],
    durations: [15, 30],
    platforms: ["tiktok", "reels", "snapchat"],
    character_types: ["ai_human", "product_only", "narrator"],
    scene_types: ["hook", "collection", "details", "cta"],
    required_fields: ["business_name"],
    base_prompt: "Fashion store ad for {{business_name}}.\nCollection: {{product}}.\nStyle signature: {{differentiator}}.\nOffer exactly as written: {{offer}}.\nRunway-style walks, fabric close-ups, bold colours.",
    negative_prompt: NEG,
    variables: VARS,
    scene_plan: [
      { title: "الخطاف", duration_s: 5, goal: "bold fashion moment" },
      { title: "التشكيلة", duration_s: 10, goal: "outfits from the collection" },
      { title: "التفاصيل", duration_s: 8, goal: "fabric and accessory close-ups" },
      { title: "الدعوة", duration_s: 7, goal: "store front or packaging and call to shop" },
    ],
    editing_notes: "قطع على الضربات الموسيقية.",
  },
  {
    slug: "professional-service-30",
    name: "إعلان خدمة احترافية",
    description: "مشكلة ثم حل ثم ثقة ثم دعوة للتواصل.",
    preview: "عندك مشكلة في…؟ خلّها علينا.",
    business_types: ["professional_services", "other"],
    goals: ["attract_customers", "increase_orders", "brand_awareness"],
    styles: ["realistic", "story", "documentary"],
    durations: [30],
    platforms: ["youtube", "reels", "website"],
    character_types: ["narrator", "virtual_presenter"],
    scene_types: ["problem", "solution", "trust", "cta"],
    required_fields: ["business_name", "product"],
    base_prompt: "Professional services ad for {{business_name}}.\nService: {{product}}.\nWho it helps: {{audience}}.\nWhy them: {{differentiator}}.\nContact: {{contact}}.\nClean modern office, confident team at work, documentary feel.",
    negative_prompt: NEG,
    variables: VARS,
    scene_plan: [
      { title: "المشكلة", duration_s: 6, goal: "a relatable problem the audience faces" },
      { title: "الحل", duration_s: 10, goal: "the service in action" },
      { title: "الثقة", duration_s: 8, goal: "team professionalism and attention to detail" },
      { title: "التواصل", duration_s: 6, goal: "call to contact" },
    ],
    editing_notes: "إيقاع متوسط، نص واضح لطريقة التواصل إن وُجدت فقط.",
  },
];

// يملأ المتغيرات من بيانات النشاط ويحذف الأسطر التي بقي فيها متغير فارغ
export function renderTemplate(text: string, brand: Record<string, string>) {
  const map: Record<string, string> = {
    business_name: brand.name ?? "", product: brand.description ?? "", city: brand.city ?? "", offer: brand.offer ?? "",
    differentiator: brand.differentiator ?? "", audience: brand.audience ?? "", contact: brand.contact ?? "",
  };
  const missing = new Set<string>();
  const lines = text.split("\n").filter((line) => {
    const vars = [...line.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    const empty = vars.filter((v) => !map[v]?.trim());
    empty.forEach((v) => missing.add(v));
    return empty.length === 0;
  });
  return { text: lines.map((l) => l.replace(/\{\{(\w+)\}\}/g, (_, v: string) => map[v].trim())).join("\n"), missing: [...missing] };
}
