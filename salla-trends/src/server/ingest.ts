import "server-only";
import type { Tx } from "./db";
import { parseOrder, parseProduct, productIdentity, statusCounts, orderStatusSlug, type ParsedOrder, type ParsedProduct, type WebhookEnvelope } from "./salla/parse";
import { tokenSetFrom } from "./salla/client";
import { enqueueInitialSync, saveTokens, uninstallStore, upsertStore } from "./stores";

// معالجة أحداث سلة. كل دالة هنا تستقبل معاملة العامل، فالحدث يُطبق كاملًا أو لا يُطبق.

export type IngestResult = { handled: boolean; note?: string };

async function storeByMerchant(tx: Tx, merchantId: number | null): Promise<{ id: string; status: string } | undefined> {
  if (merchantId === null) return undefined;
  return tx.one("SELECT id, status FROM stores WHERE salla_merchant_id = $1", [merchantId]);
}

export async function upsertProduct(tx: Tx, storeId: string, p: ParsedProduct) {
  const { fingerprint, taxonomy } = productIdentity(storeId, p);
  await tx.q(
    `INSERT INTO products (store_id, salla_product_id, name, sku, gtin, category_names, taxonomy, fingerprint, price_halalas, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (store_id, salla_product_id) DO UPDATE SET name = $3, sku = $4, gtin = $5, category_names = $6, taxonomy = $7,
       fingerprint = $8, price_halalas = $9, status = $10, updated_at = now()`,
    [storeId, p.salla_product_id, p.name, p.sku, p.gtin, p.category_names, taxonomy, fingerprint, p.price_halalas, p.status],
  );
  // سطور الطلبات السابقة لهذا المنتج تتبع بصمته وتصنيفه الجديدين (مثلًا بعد إضافة باركود)
  await tx.q(
    "UPDATE order_lines SET fingerprint = $3, taxonomy = $4, updated_at = now() WHERE store_id = $1 AND salla_product_id = $2 AND (fingerprint <> $3 OR taxonomy <> $4)",
    [storeId, p.salla_product_id, fingerprint, taxonomy],
  );
}

export async function upsertOrder(tx: Tx, storeId: string, order: ParsedOrder) {
  if (order.lines.length === 0) {
    // حدث تغيير حالة بلا منتجات: نحدّث الحساب فقط
    await setOrderStatus(tx, storeId, order.id, order.status_slug);
    return;
  }
  // منتج نعرفه من الكتالوج يأخذ بصمته من هناك (فيها الباركود والأقسام)؛ وإلا من اسم السطر
  const ids = [...new Set(order.lines.map((l) => l.salla_product_id).filter((v): v is number => v !== null))];
  const known = new Map(
    (await tx.q<{ salla_product_id: string; fingerprint: string; taxonomy: string }>(
      "SELECT salla_product_id, fingerprint, taxonomy FROM products WHERE store_id = $1 AND salla_product_id = ANY($2::bigint[])",
      [storeId, ids],
    )).map((r) => [Number(r.salla_product_id), r]),
  );
  // سطر حُذف من الطلب بعد تعديله لا يبقى في الحساب
  await tx.q("DELETE FROM order_lines WHERE store_id = $1 AND salla_order_id = $2 AND NOT (line_key = ANY($3::text[]))", [
    storeId, order.id, order.lines.map((l) => l.line_key),
  ]);
  for (const l of order.lines) {
    const k = l.salla_product_id !== null ? known.get(l.salla_product_id) : undefined;
    const id = k ?? productIdentity(storeId, { name: l.name, salla_product_id: l.salla_product_id });
    await tx.q(
      `INSERT INTO order_lines (store_id, salla_order_id, line_key, salla_product_id, fingerprint, name, taxonomy, quantity, revenue_halalas,
                                currency, city, region, country, ordered_at, status_slug, counted)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (store_id, salla_order_id, line_key) DO UPDATE SET salla_product_id = $4, fingerprint = $5, name = $6, taxonomy = $7,
         quantity = $8, revenue_halalas = $9, currency = $10, city = $11, region = $12, country = $13, ordered_at = $14,
         status_slug = $15, counted = $16, updated_at = now()`,
      [storeId, l.salla_order_id, l.line_key, l.salla_product_id, id.fingerprint, l.name, id.taxonomy, l.quantity, l.revenue_halalas,
        l.currency, l.city, l.region, l.country, l.ordered_at, l.status_slug, l.counted],
    );
  }
}

async function setOrderStatus(tx: Tx, storeId: string, orderId: number, slug: string | null) {
  if (!slug) return;
  await tx.q("UPDATE order_lines SET status_slug = $3, counted = $4, updated_at = now() WHERE store_id = $1 AND salla_order_id = $2", [
    storeId, orderId, slug, statusCounts(slug),
  ]);
}

export async function ingestEvent(tx: Tx, ev: WebhookEnvelope): Promise<IngestResult> {
  const event = ev.event;

  if (event === "app.store.authorize" || event === "app.store.authorized") {
    if (ev.merchant === null) return { handled: false, note: "حدث بلا رقم متجر" };
    const storeId = await upsertStore(tx, ev.merchant);
    await saveTokens(tx, storeId, tokenSetFrom(ev.data));
    await enqueueInitialSync(tx, storeId);
    await tx.q("INSERT INTO audit_log (actor, action, target) VALUES ('salla', 'store.authorize', $1)", [`store:${storeId}`]);
    return { handled: true };
  }

  if (event === "app.installed") {
    if (ev.merchant === null) return { handled: false, note: "حدث بلا رقم متجر" };
    const storeId = await upsertStore(tx, ev.merchant);
    await tx.q("INSERT INTO audit_log (actor, action, target) VALUES ('salla', 'store.install', $1)", [`store:${storeId}`]);
    return { handled: true };
  }

  const store = await storeByMerchant(tx, ev.merchant);
  if (!store) return { handled: false, note: "متجر غير معروف" };

  if (event === "app.uninstalled") {
    await uninstallStore(tx, store.id);
    await tx.q("INSERT INTO audit_log (actor, action, target) VALUES ('salla', 'store.uninstall', $1)", [`store:${store.id}`]);
    return { handled: true };
  }
  if (store.status !== "active") return { handled: false, note: "المتجر حذف التطبيق" };

  if (event.startsWith("order.")) {
    // بعض أحداث الطلب تضع الطلب داخل data.order
    const raw = (ev.data.order && typeof ev.data.order === "object" ? ev.data.order : ev.data) as Record<string, unknown>;
    if (event === "order.deleted") {
      const id = Number(raw.id);
      if (Number.isSafeInteger(id)) await tx.q("DELETE FROM order_lines WHERE store_id = $1 AND salla_order_id = $2", [store.id, id]);
      return { handled: true };
    }
    const order = parseOrder(raw, ev.created_at ?? new Date());
    if (!order) return { handled: false, note: "طلب بلا رقم" };
    // حدث تغيير الحالة قد يضع الحالة الجديدة خارج الطلب
    if (!order.status_slug && ev.data.status) order.status_slug = orderStatusSlug({ status: ev.data.status });
    if (event === "order.cancelled" || event === "order.refunded") order.status_slug ??= event === "order.cancelled" ? "canceled" : "refunded";
    for (const l of order.lines) {
      l.status_slug = order.status_slug;
      l.counted = statusCounts(order.status_slug);
    }
    await upsertOrder(tx, store.id, order);
    return { handled: true };
  }

  if (event === "product.created" || event === "product.updated") {
    const p = parseProduct(ev.data);
    if (!p) return { handled: false, note: "منتج بلا رقم أو اسم" };
    await upsertProduct(tx, store.id, p);
    return { handled: true };
  }
  if (event === "product.deleted") {
    const id = Number(ev.data.id);
    if (Number.isSafeInteger(id)) await tx.q("DELETE FROM products WHERE store_id = $1 AND salla_product_id = $2", [store.id, id]);
    return { handled: true };
  }

  return { handled: false, note: "حدث لا نحتاجه" };
}
