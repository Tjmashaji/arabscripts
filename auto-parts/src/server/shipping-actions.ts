"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { editableSettings, parseSetting } from "@/lib/site";
import { SETTINGS_TAG } from "@/lib/site-data";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { localePath, requireSession, requireStaff } from "@/lib/auth";
import { currencies } from "@/lib/catalog";
import { MAX_UPLOAD_BYTES, safeFileName, sniffDocument } from "@/lib/partners";
import { endOfDayRiyadh, normalizePhone } from "@/lib/quotes";
import {
  adminOrderTargets, countryList, paymentMethods, shipmentDocKinds, shipmentStatuses, shippingModes, supplierOrderTargets,
} from "@/lib/shipping";
import { formLocale, text } from "./form";

const uuid = z.uuid();
// رمز الخطأ من قاعدة البيانات ("ap: tracking required" → tracking_required) يُترجم في الواجهة إن وُجد في errors.
const fail = (message: string) => `error=${encodeURIComponent(message.replace(/^ap: /, "").replace(/\s+/g, "_"))}`;
const intOrNull = (v: string) => (/^\d{1,4}$/.test(v) ? Number(v) : null);
const decimalOrNull = (v: string) => (/^\d{1,7}(\.\d{1,3})?$/.test(v) && Number(v) > 0 ? Number(v) : null);
const optionalUuid = (v: string) => (uuid.safeParse(v).success ? v : null);
const money = (v: string) => (/^\d{1,9}(\.\d{1,2})?$/.test(v) && Number(v) > 0 ? Number(v) : null);
const withQuery = (path: string, q: string, hash = "") => `${path}?${q}${hash}`;

// ───────── الناقل ─────────
export async function saveCarrierService(form: FormData) {
  const locale = formLocale(form);
  // من طلب الاعتماد (قبل الاعتماد) أو من لوحة الناقل.
  const fromApplication = form.get("back") === "application";
  await requireSession(locale, fromApplication ? "/partner/application" : "/carrier");
  const back = localePath(locale, fromApplication ? "/partner/application" : "/carrier");
  const hash = fromApplication ? "#shipping" : "#services";
  const org = uuid.safeParse(text(form, "organizationId", 64));
  const mode = z.enum(shippingModes).safeParse(form.get("mode"));
  const origins = countryList(text(form, "origins", 200));
  const destinations = countryList(text(form, "destinations", 200));
  const name = text(form, "name", 120);
  const rawPrice = text(form, "pricePerKg", 12);
  const price = rawPrice ? money(rawPrice) : null;
  const rawMin = text(form, "minCharge", 12);
  const minCharge = rawMin ? money(rawMin) : null;
  const currency = z.enum(currencies).safeParse(form.get("priceCurrency"));
  if (!org.success || !mode.success || !origins || !destinations || name.length < 2 || (rawPrice && !price) || (rawMin && !minCharge)
      || (fromApplication && !price)) {
    redirect(withQuery(back, "error=invalid", hash));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_save_carrier_service", {
    p_id: optionalUuid(text(form, "serviceId", 64)), p_org: org.data, p_name: name, p_mode: mode.data,
    p_origins: origins, p_destinations: destinations,
    p_days_min: intOrNull(text(form, "daysMin", 3)), p_days_max: intOrNull(text(form, "daysMax", 3)),
    p_notes: text(form, "notes", 1000) || null, p_enabled: form.get("enabled") === "on",
    p_price_per_kg: price, p_price_currency: price && currency.success ? currency.data : null, p_min_charge: minCharge,
    p_pickup_location: text(form, "pickupLocation", 200) || null,
  });
  redirect(withQuery(back, error ? fail(error.message) : "saved=1", hash));
}

export async function submitShippingQuote(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/carrier");
  const id = uuid.safeParse(text(form, "shippingQuoteId", 64));
  if (!id.success) redirect(localePath(locale, "/carrier"));
  const page = localePath(locale, `/carrier/quotes/${id.data}`);
  const price = money(text(form, "price", 14));
  const currency = z.enum(currencies).safeParse(form.get("currency"));
  const validUntil = endOfDayRiyadh(text(form, "validUntil", 10));
  if (!price || !currency.success || !validUntil) redirect(withQuery(page, "error=invalid"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_carrier_submit_shipping_quote", {
    p_quote: id.data, p_price: price, p_currency: currency.data, p_days: intOrNull(text(form, "days", 3)),
    p_valid_until: validUntil, p_reference: text(form, "reference", 120) || null, p_notes: text(form, "notes", 1000) || null,
  });
  redirect(withQuery(page, error ? fail(error.message) : "saved=1"));
}

export async function withdrawShippingQuote(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/carrier");
  const id = uuid.safeParse(text(form, "shippingQuoteId", 64));
  if (!id.success) redirect(localePath(locale, "/carrier"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_carrier_withdraw_shipping_quote", { p_quote: id.data });
  redirect(withQuery(localePath(locale, `/carrier/quotes/${id.data}`), error ? fail(error.message) : "saved=1"));
}

// تحديث الشحنة ورفع مستنداتها: للناقل المسند ولإدارة الشحن. back يحدد الصفحة التي يعود إليها النموذج.
function backTo(form: FormData, locale: string): string {
  const back = text(form, "back", 200);
  return /^\/(carrier\/shipments|admin\/orders)\/[0-9a-f-]{36}$/.test(back) ? localePath(locale, back) : localePath(locale, "/carrier");
}

export async function updateShipment(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/carrier");
  const back = backTo(form, locale);
  const id = uuid.safeParse(text(form, "shipmentId", 64));
  const status = z.enum(shipmentStatuses).safeParse(form.get("status"));
  if (!id.success || !status.success) redirect(withQuery(back, "error=invalid", "#shipment"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_update_shipment", {
    p_shipment: id.data, p_status: status.data, p_tracking: text(form, "tracking", 80) || null,
    p_location: text(form, "location", 120) || null, p_note: text(form, "note", 1000) || null,
  });
  redirect(withQuery(back, error ? fail(error.message) : "saved=1", "#shipment"));
}

export async function uploadShipmentDocument(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/carrier");
  const back = backTo(form, locale);
  const id = uuid.safeParse(text(form, "shipmentId", 64));
  const kind = z.enum(shipmentDocKinds).safeParse(form.get("kind"));
  const file = form.get("file");
  if (!id.success || !kind.success || !(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    redirect(withQuery(back, "error=upload", "#documents"));
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  const type = sniffDocument(buffer.subarray(0, 16));
  if (!type) redirect(withQuery(back, "error=upload", "#documents"));
  const supabase = await createClient();
  const path = `${id.data}/${crypto.randomUUID()}.${type.ext}`;
  const { error: upErr } = await supabase.storage.from("ap-shipment-docs").upload(path, buffer, { contentType: type.mime, upsert: false });
  if (upErr) redirect(withQuery(back, "error=upload", "#documents"));
  const { error } = await supabase.rpc("ap_add_shipment_document", {
    p_shipment: id.data, p_kind: kind.data, p_path: path, p_mime: type.mime, p_file_name: safeFileName(file.name),
  });
  if (error) {
    await supabase.storage.from("ap-shipment-docs").remove([path]);
    redirect(withQuery(back, fail(error.message), "#documents"));
  }
  redirect(withQuery(back, "saved=1", "#documents"));
}

// ───────── الإدارة: عروض الشحن (من صفحة طلب التسعير) ─────────
async function adminQuotePage(form: FormData, permission: string) {
  const locale = formLocale(form);
  await requireStaff(locale, "/admin/quotes", permission);
  const id = uuid.safeParse(text(form, "requestId", 64));
  if (!id.success) redirect(localePath(locale, "/admin/quotes"));
  return { locale, id: id.data, page: localePath(locale, `/admin/quotes/${id.data}`), supabase: await createClient() };
}

function parcel(form: FormData) {
  return {
    mode: z.enum(shippingModes).safeParse(form.get("mode")),
    origin: text(form, "originCountry", 2).toUpperCase(),
    weight: decimalOrNull(text(form, "weightKg", 12)),
    volumetric: decimalOrNull(text(form, "volumetricKg", 12)),
  };
}

export async function requestShippingQuote(form: FormData) {
  const { page, id, supabase } = await adminQuotePage(form, "shipping.manage");
  const carrier = uuid.safeParse(text(form, "carrierId", 64));
  const p = parcel(form);
  if (!carrier.success || !p.mode.success || !/^[A-Z]{2}$/.test(p.origin) || !p.weight) redirect(withQuery(page, "error=invalid", "#shipping"));
  const { error } = await supabase.rpc("ap_admin_request_shipping_quote", {
    p_request: id, p_carrier: carrier.data, p_mode: p.mode.data, p_origin_country: p.origin,
    p_origin_city: text(form, "originCity", 80) || null, p_destination_city: text(form, "destinationCity", 80) || null,
    p_pieces: intOrNull(text(form, "pieces", 3)) ?? 1, p_weight_kg: p.weight, p_volumetric_kg: p.volumetric,
    p_length_cm: decimalOrNull(text(form, "lengthCm", 8)), p_width_cm: decimalOrNull(text(form, "widthCm", 8)),
    p_height_cm: decimalOrNull(text(form, "heightCm", 8)), p_notes: text(form, "notes", 1000) || null,
  });
  redirect(withQuery(page, error ? fail(error.message) : "done=1", "#shipping"));
}

export async function addShippingQuote(form: FormData) {
  const { page, id, supabase } = await adminQuotePage(form, "shipping.manage");
  const p = parcel(form);
  const price = money(text(form, "price", 14));
  const currency = z.enum(currencies).safeParse(form.get("currency"));
  const validUntil = endOfDayRiyadh(text(form, "validUntil", 10));
  const carrierName = text(form, "carrierName", 120);
  if (!p.mode.success || !/^[A-Z]{2}$/.test(p.origin) || !p.weight || !price || !currency.success || !validUntil || carrierName.length < 2) {
    redirect(withQuery(page, "error=invalid", "#shipping"));
  }
  const { error } = await supabase.rpc("ap_admin_add_shipping_quote", {
    p_request: id, p_carrier_name: carrierName, p_mode: p.mode.data, p_origin_country: p.origin,
    p_origin_city: text(form, "originCity", 80) || null, p_destination_city: text(form, "destinationCity", 80) || null,
    p_pieces: intOrNull(text(form, "pieces", 3)) ?? 1, p_weight_kg: p.weight, p_volumetric_kg: p.volumetric,
    p_price: price, p_currency: currency.data, p_days: intOrNull(text(form, "days", 3)), p_valid_until: validUntil,
    p_reference: text(form, "reference", 120) || null, p_notes: text(form, "notes", 1000) || null,
  });
  redirect(withQuery(page, error ? fail(error.message) : "done=1", "#shipping"));
}

export async function applyShippingQuote(form: FormData) {
  const { page, supabase } = await adminQuotePage(form, "quotes.manage");
  const sq = uuid.safeParse(text(form, "shippingQuoteId", 64));
  const cq = uuid.safeParse(text(form, "quoteId", 64));
  if (!sq.success || !cq.success) redirect(withQuery(page, "error=invalid", "#shipping"));
  const amount = text(form, "amountSar", 14);
  const { error } = await supabase.rpc("ap_admin_apply_shipping_quote", {
    p_shipping_quote: sq.data, p_customer_quote: cq.data, p_amount: amount ? money(amount) : null,
    p_fx_note: text(form, "fxNote", 150) || null,
  });
  redirect(withQuery(page, error ? fail(error.message) : "saved=1", "#draft"));
}

// ───────── الإدارة: الطلبات والشحنات ─────────
async function adminOrderPage(form: FormData, permission: string) {
  const locale = formLocale(form);
  await requireStaff(locale, "/admin/orders", permission);
  const id = uuid.safeParse(text(form, "orderId", 64));
  if (!id.success) redirect(localePath(locale, "/admin/orders"));
  return { id: id.data, page: localePath(locale, `/admin/orders/${id.data}`), supabase: await createClient() };
}

export async function recordPayment(form: FormData) {
  const { id, page, supabase } = await adminOrderPage(form, "finance.manage");
  const amount = money(text(form, "amount", 14));
  const method = z.enum(paymentMethods).safeParse(form.get("method"));
  if (!amount || !method.success || form.get("confirm") !== "on") redirect(withQuery(page, "error=invalid", "#payment"));
  const { error } = await supabase.rpc("ap_finance_record_payment", {
    p_order: id, p_amount: amount, p_currency: text(form, "currency", 3), p_method: method.data,
    p_reference: text(form, "reference", 120), p_received_by: text(form, "receivedBy", 200), p_note: text(form, "note", 1000) || null,
  });
  revalidatePath("/[locale]/admin", "layout");
  redirect(withQuery(page, error ? fail(error.message) : "done=1", "#payment"));
}

export async function setOrderStatus(form: FormData) {
  const { id, page, supabase } = await adminOrderPage(form, "orders.manage_all");
  const status = z.enum(adminOrderTargets).safeParse(form.get("status"));
  if (!status.success) redirect(withQuery(page, "error=invalid"));
  const { error } = await supabase.rpc("ap_admin_set_order_status", { p_order: id, p_status: status.data, p_note: text(form, "note", 1000) || null });
  revalidatePath("/[locale]/admin", "layout");
  redirect(withQuery(page, error ? fail(error.message) : "done=1"));
}

export async function createShipment(form: FormData) {
  const { id, page, supabase } = await adminOrderPage(form, "shipping.manage");
  const mode = z.enum(shippingModes).safeParse(form.get("mode"));
  const phone = normalizePhone(text(form, "recipientPhone", 30));
  const carrier = optionalUuid(text(form, "carrierId", 64));
  const carrierName = text(form, "carrierName", 120) || null;
  const address = text(form, "address", 500);
  if (!mode.success || !phone || address.length < 5 || (!carrier && !carrierName && !optionalUuid(text(form, "shippingQuoteId", 64)))) {
    redirect(withQuery(page, "error=invalid", "#shipment"));
  }
  const { error } = await supabase.rpc("ap_admin_create_shipment", {
    p_order: id, p_shipping_quote: optionalUuid(text(form, "shippingQuoteId", 64)), p_carrier: carrier, p_carrier_name: carrierName,
    p_mode: mode.data, p_pieces: intOrNull(text(form, "pieces", 3)), p_weight_kg: decimalOrNull(text(form, "weightKg", 12)),
    p_volumetric_kg: decimalOrNull(text(form, "volumetricKg", 12)), p_recipient_name: text(form, "recipientName", 120),
    p_recipient_phone: phone, p_destination_city: text(form, "city", 80), p_destination_address: address,
    p_estimated_days: intOrNull(text(form, "days", 3)),
  });
  redirect(withQuery(page, error ? fail(error.message) : "done=1", "#shipment"));
}

export async function updateSetting(form: FormData) {
  const locale = formLocale(form);
  await requireStaff(locale, "/admin/settings", "settings.edit");
  const back = localePath(locale, "/admin/settings");
  const key = text(form, "key", 60);
  const value = (editableSettings as string[]).includes(key) ? parseSetting(key, text(form, "value", 200)) : null;
  if (value === null) redirect(withQuery(back, `error=invalid&key=${encodeURIComponent(key)}`));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_admin_update_setting", { p_key: key, p_value: value });
  updateTag(SETTINGS_TAG);
  redirect(withQuery(back, error ? fail(error.message) : "saved=1"));
}

// ───────── المورد والعميل ─────────
export async function supplierSetOrderStatus(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/partner/orders");
  const back = localePath(locale, "/partner/orders");
  const id = uuid.safeParse(text(form, "orderId", 64));
  const status = z.enum(supplierOrderTargets).safeParse(form.get("status"));
  if (!id.success || !status.success) redirect(withQuery(back, "error=invalid"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_supplier_set_order_status", { p_order: id.data, p_status: status.data, p_note: text(form, "note", 1000) || null });
  redirect(withQuery(back, error ? fail(error.message) : "saved=1"));
}

export async function confirmDelivery(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/account/orders");
  const back = localePath(locale, "/account/orders");
  const id = uuid.safeParse(text(form, "orderId", 64));
  if (!id.success) redirect(back);
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_customer_confirm_delivery", { p_order: id.data });
  redirect(withQuery(back, error ? fail(error.message) : "confirmed=1"));
}

// العميل يبلغ عن تحويل بنكي لطلبه؛ المالية تطابقه ثم تسجّل الدفع.
export async function reportPayment(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/account/orders");
  const back = localePath(locale, "/account/orders");
  const id = uuid.safeParse(text(form, "orderId", 64));
  if (!id.success) redirect(back);
  const reference = text(form, "reference", 120);
  if (reference.length < 3) redirect(withQuery(back, "error=invalid_reference"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_customer_report_payment", { p_order: id.data, p_reference: reference });
  redirect(withQuery(back, error ? fail(error.message) : "reported=1"));
}
