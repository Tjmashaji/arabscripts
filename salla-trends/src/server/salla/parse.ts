// تحويل كائنات سلة (من الويب هوك أو من الـ API) إلى صفوفنا.
// نقرأ بحذر: الحقول تختلف قليلًا بين الحدث والـ API وبين إصدارات سلة، فكل حقل له بدائل، وما لا يُفهم يُتجاهل بدل أن يُخمَّن.
// لا نأخذ من الطلب أي بيانات للعميل سوى المدينة والدولة.
import { fingerprint } from "@/lib/normalize";
import { regionFor } from "@/lib/regions";
import { classify } from "@/lib/taxonomy";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : undefined);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/,/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && Number.isSafeInteger(n) ? n : null;
};

// المبالغ في سلة بالريال (كسور عشرية) وقد تأتي رقمًا أو {amount, currency}
function money(v: unknown): { halalas: number; currency: string | null } | null {
  const o = obj(v);
  const amount = num(o ? o.amount : v);
  if (amount === null) return null;
  return { halalas: Math.round(amount * 100), currency: o ? str(o.currency) : null };
}

// تاريخ سلة: {date: "2024-03-01 14:05:00.000000", timezone: "Asia/Riyadh"} أو نص ISO
export function parseSallaDate(v: unknown): Date | null {
  const o = obj(v);
  const raw = str(o ? o.date : v);
  if (!raw) return null;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?$/);
  // بلا منطقة زمنية صريحة: سلة تعمل بتوقيت الرياض (+03:00) ما لم يُذكر غيره
  const d = m ? new Date(`${m[1]}T${m[2]}${o?.timezone === "UTC" ? "Z" : "+03:00"}`) : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// حالات لا تُحسب مبيعات: ملغي، مسترجع، محذوف، أو لم يُدفع بعد
const EXCLUDED = new Set(["canceled", "cancelled", "refunded", "restored", "restoring", "payment_pending", "deleted", "archived", "pending_payment"]);
export const statusCounts = (slug: string | null) => !slug || !EXCLUDED.has(slug);

export function orderStatusSlug(order: Obj): string | null {
  const s = order.status;
  const o = obj(s);
  const slug = str(o ? o.slug : s);
  return slug ? slug.toLowerCase().replace(/[\s-]+/g, "_") : null;
}

export type OrderLine = {
  salla_order_id: number;
  line_key: string;
  salla_product_id: number | null;
  name: string;
  sku: string | null;
  quantity: number;
  revenue_halalas: number;
  currency: string;
  city: string | null;
  country: string | null;
  region: string | null;
  ordered_at: Date;
  status_slug: string | null;
  counted: boolean;
};

export type ParsedOrder = { id: number; status_slug: string | null; lines: OrderLine[] };

function orderLocation(order: Obj): { city: string | null; country: string | null } {
  const shipping = obj(order.shipping);
  const candidates = [obj(shipping?.address), obj(order.ship_to), shipping, obj(order.customer)];
  for (const c of candidates) {
    if (!c) continue;
    const city = str(obj(c.city)?.name ?? c.city);
    const country = str(obj(c.country)?.code ?? obj(c.country)?.name ?? c.country_code ?? c.country);
    if (city || country) return { city, country };
  }
  return { city: null, country: null };
}

export function parseOrder(raw: unknown, fallbackDate = new Date()): ParsedOrder | null {
  const order = obj(raw);
  const id = int(order?.id);
  if (!order || id === null) return null;
  const status_slug = orderStatusSlug(order);
  const ordered_at = parseSallaDate(order.date) ?? parseSallaDate(order.created_at) ?? fallbackDate;
  const { city, country } = orderLocation(order);
  const region = regionFor(city, country);
  const orderCurrency = str(order.currency) ?? str(obj(obj(order.amounts)?.total)?.currency) ?? "SAR";
  const items = Array.isArray(order.items) ? order.items : [];
  const lines: OrderLine[] = [];
  items.forEach((it, i) => {
    const item = obj(it);
    if (!item) return;
    const product = obj(item.product);
    const quantity = int(item.quantity);
    const name = str(item.name) ?? str(product?.name);
    if (!quantity || quantity <= 0 || !name) return;
    const amounts = obj(item.amounts);
    const total = money(amounts?.total) ?? money(item.total);
    const unit = money(amounts?.price_without_tax) ?? money(item.price) ?? money(product?.price);
    const revenue = total ?? (unit ? { halalas: unit.halalas * quantity, currency: unit.currency } : { halalas: 0, currency: null });
    const productId = int(item.product_id) ?? int(product?.id);
    lines.push({
      salla_order_id: id,
      line_key: str(item.id) ?? `${productId ?? "x"}:${i}`,
      salla_product_id: productId,
      name: name.slice(0, 300),
      sku: str(item.sku) ?? str(product?.sku),
      quantity,
      revenue_halalas: Math.max(0, revenue.halalas),
      currency: revenue.currency ?? orderCurrency,
      city: city?.slice(0, 120) ?? null,
      country,
      region,
      ordered_at,
      status_slug,
      counted: statusCounts(status_slug),
    });
  });
  return { id, status_slug, lines };
}

export type ParsedProduct = {
  salla_product_id: number;
  name: string;
  sku: string | null;
  gtin: string | null;
  category_names: string[];
  price_halalas: number | null;
  status: string | null;
};

export function parseProduct(raw: unknown): ParsedProduct | null {
  const p = obj(raw);
  const id = int(p?.id);
  const name = str(p?.name);
  if (!p || id === null || !name) return null;
  const cats = Array.isArray(p.categories) ? p.categories : [];
  return {
    salla_product_id: id,
    name: name.slice(0, 300),
    sku: str(p.sku),
    gtin: str(p.gtin) ?? str(p.barcode) ?? str(p.mpn),
    category_names: cats.map((c) => str(obj(c)?.name)).filter((c): c is string => Boolean(c)).slice(0, 10),
    price_halalas: money(p.price)?.halalas ?? null,
    status: str(p.status),
  };
}

// البصمة والتصنيف لسطر أو منتج. منتج بلا بصمة صالحة يأخذ بصمة خاصة بالمتجر فلا يُدمج مع غيره أبدًا.
export function productIdentity(storeId: string, p: { name: string; gtin?: string | null; category_names?: readonly string[]; salla_product_id?: number | null }) {
  return {
    fingerprint: fingerprint(p.name, p.gtin) ?? `local:${storeId}:${p.salla_product_id ?? p.name}`,
    taxonomy: classify(p.category_names ?? [], p.name),
  };
}

export type WebhookEnvelope = { event: string; merchant: number | null; created_at: Date | null; data: Obj };

export function parseEnvelope(raw: unknown): WebhookEnvelope | null {
  const o = obj(raw);
  const event = str(o?.event);
  if (!o || !event) return null;
  return { event, merchant: int(o.merchant), created_at: parseSallaDate(o.created_at), data: obj(o.data) ?? {} };
}
