// بيانات تجريبية للتطوير المحلي فقط: 12 متجرًا وهميًا بطلبات 60 يومًا، ثم حساب الترند.
// لا تشغله على قاعدة الإنتاج: المتاجر تحمل أرقام سلة من 990000001 فما فوق، ويحذفها السكربت ويعيد إنشاءها في كل تشغيل.
// الاستخدام: WORKER_DATABASE_URL=... npm run db:demo
import { Client } from "pg";
import { fingerprint } from "../src/lib/normalize";
import { regionFor } from "../src/lib/regions";
import { classify } from "../src/lib/taxonomy";

const PRODUCTS: { names: string[]; cat: string; price: number; base: number; trend: number }[] = [
  { names: ["عطر عود ملكي 100ml", "عطر العود الملكي ١٠٠ مل"], cat: "العطور", price: 249, base: 3, trend: 2.2 },
  { names: ["دهن عود كمبودي 3 مل", "دهن العود الكمبودي 3ml"], cat: "العطور", price: 390, base: 2, trend: 1 },
  { names: ["بخور معمول فاخر 50 جرام", "بخور معمول فاخر 50g"], cat: "البخور", price: 89, base: 4, trend: 1.1 },
  { names: ["سماعة لاسلكية برو بلوتوث", "سماعه لاسلكيه برو بلوتوث"], cat: "الإلكترونيات", price: 199, base: 3, trend: 1.6 },
  { names: ["شاحن سريع 65 واط", "شاحن سريع 65واط"], cat: "إكسسوارات الجوال", price: 119, base: 3, trend: 0.8 },
  { names: ["كفر ايفون 17 شفاف", "كفر آيفون 17 شفاف"], cat: "الجوالات", price: 49, base: 5, trend: 2.8 },
  { names: ["سيروم فيتامين سي 30ml", "سيروم فيتامين C 30 مل"], cat: "العناية بالبشرة", price: 79, base: 4, trend: 1.9 },
  { names: ["كريم مرطب للبشرة الجافة", "كريم مرطب للبشره الجافه"], cat: "العناية", price: 65, base: 3, trend: 1 },
  { names: ["عباية كريب سوداء سادة", "عبايه كريب سوداء ساده"], cat: "العبايات", price: 320, base: 2, trend: 1.3 },
  { names: ["ثوب رجالي صيفي ابيض", "ثوب رجالي صيفي أبيض"], cat: "الملابس", price: 180, base: 2, trend: 0.7 },
  { names: ["قهوة مختصة إثيوبي 250 جرام", "قهوه مختصه اثيوبي 250g"], cat: "القهوة", price: 75, base: 4, trend: 1.5 },
  { names: ["تمر سكري مفتل 1 كيلو", "تمر سكري مفتل 1kg"], cat: "التمور", price: 60, base: 4, trend: 1.2 },
  { names: ["عسل سدر جبلي 500 جرام", "عسل سدر جبلي 500g"], cat: "العسل", price: 210, base: 2, trend: 1.4 },
  { names: ["مكعبات تعليمية للأطفال 100 قطعة", "مكعبات تعليميه للاطفال 100 قطعه"], cat: "ألعاب الأطفال", price: 95, base: 2, trend: 2 },
  { names: ["حبل نط رياضي احترافي", "حبل نط رياضي إحترافي"], cat: "الرياضة", price: 39, base: 3, trend: 0.9 },
  { names: ["دلة قهوة ستيل 1 لتر", "دله قهوه ستيل 1 لتر"], cat: "المطبخ", price: 135, base: 2, trend: 1.7 },
  { names: ["مبخرة كهربائية محمولة", "مبخره كهربائيه محموله"], cat: "المنزل", price: 99, base: 3, trend: 3.1 },
  { names: ["كولاجين بودرة 300 جرام", "كولاجين بودره 300g"], cat: "المكملات", price: 145, base: 2, trend: 1.8 },
  { names: ["صندوق هدايا توزيعات مواليد", "صندوق هدايا توزيعات مواليد"], cat: "الهدايا", price: 55, base: 2, trend: 1.1 },
  { names: ["ساعة ذكية رياضية مقاومة للماء", "ساعه ذكيه رياضيه مقاومه للماء"], cat: "الإكسسوارات", price: 260, base: 2, trend: 1.3 },
];
const CITIES = ["الرياض", "الرياض", "الرياض", "جدة", "جدة", "مكة المكرمة", "الدمام", "الخبر", "الأحساء", "المدينة المنورة", "بريدة", "أبها", "خميس مشيط", "تبوك", "حائل", "جازان", "Dubai"];

let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];

async function main() {
  const url = process.env.WORKER_DATABASE_URL;
  if (!url) throw new Error("WORKER_DATABASE_URL غير معرّف");
  const db = new Client({ connectionString: url, options: "-c search_path=trends" });
  await db.connect();
  await db.query("BEGIN");
  await db.query("DELETE FROM stores WHERE salla_merchant_id >= 990000001");
  const now = Date.now();
  let orderId = 1;
  for (let s = 1; s <= 12; s++) {
    const { rows } = await db.query<{ id: string }>(
      "INSERT INTO stores (salla_merchant_id, name, domain, contributes, consent_at, last_synced_at) VALUES ($1, $2, $3, true, now(), now()) RETURNING id",
      [990000000 + s, `متجر تجريبي ${s}`, `https://demo-${s}.example`],
    );
    const storeId = rows[0].id;
    // كل متجر يبيع جزءًا من الكتالوج
    const catalog = PRODUCTS.filter(() => rand() < 0.6);
    for (const [i, p] of catalog.entries()) {
      const name = pick(p.names);
      await db.query(
        "INSERT INTO products (store_id, salla_product_id, name, category_names, taxonomy, fingerprint, price_halalas) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [storeId, i + 1, name, [p.cat], classify([p.cat], name), fingerprint(name)!, p.price * 100],
      );
    }
    for (let day = 59; day >= 0; day--) {
      for (const [i, p] of catalog.entries()) {
        // المنتجات الصاعدة تتسارع في آخر أسبوعين
        const boost = day < 14 ? 1 + (p.trend - 1) * ((14 - day) / 14) : 1;
        const n = Math.round(p.base * boost * (0.4 + rand() * 1.2) * 0.35);
        for (let k = 0; k < n; k++) {
          const city = pick(CITIES);
          const qty = 1 + Math.floor(rand() * 2);
          const name = pick(p.names);
          const at = new Date(now - day * 86400_000 - Math.floor(rand() * 86400_000));
          await db.query(
            `INSERT INTO order_lines (store_id, salla_order_id, line_key, salla_product_id, fingerprint, name, taxonomy, quantity, revenue_halalas, city, region, country, ordered_at, status_slug, counted)
             VALUES ($1, $2, '1', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'completed', true)`,
            [storeId, orderId++, i + 1, fingerprint(name)!, name, classify([p.cat], name), qty, p.price * qty * 100, city, regionFor(city, city === "Dubai" ? "AE" : "SA"), city === "Dubai" ? "AE" : "SA", at],
          );
        }
      }
    }
  }
  await db.query("COMMIT");
  // لقطتان: أمس واليوم، لتظهر أسهم الصعود والهبوط في الترتيب
  await db.query("SELECT trends.compute_trends(now() - interval '1 day')");
  await db.query("SELECT trends.compute_trends(now())");
  await db.end();
  console.log(`✓ 12 متجرًا تجريبيًا، ${orderId - 1} طلبًا، وحُسب الترند`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
