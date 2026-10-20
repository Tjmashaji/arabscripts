"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { localePath, requireSession, requireStaff } from "@/lib/auth";
import { currencies, isPartType, sniffImage } from "@/lib/catalog";
import { adminSettableStatuses, endOfDayRiyadh, MAX_REQUEST_IMAGES, normalizePhone, normalizeVin, parseQuoteLines } from "@/lib/quotes";
import { formLocale, text } from "./form";

const uuid = z.uuid();
// رمز الخطأ من قاعدة البيانات ("ap: tracking required" → tracking_required) يُترجم في الواجهة إن وُجد في errors.
const fail = (message: string) => `error=${encodeURIComponent(message.replace(/^ap: /, "").replace(/\s+/g, "_"))}`;
const intOrNull = (v: string) => (/^\d{1,4}$/.test(v) ? Number(v) : null);
const optionalUuid = (v: string) => (uuid.safeParse(v).success ? v : null);

// ───────── العميل ─────────
export async function createQuoteRequest(form: FormData) {
  const locale = formLocale(form);
  const session = await requireSession(locale, "/request-part");
  const back = (q: string) => `${localePath(locale, "/request-part")}?${q}`;
  const vin = normalizeVin(text(form, "vin", 40));
  const phone = normalizePhone(text(form, "contactPhone", 30));
  const description = text(form, "description", 2000);
  const city = text(form, "city", 80);
  const contactName = text(form, "contactName", 120) || session.fullName;
  if (vin === "invalid") redirect(back("error=vin"));
  if (!phone) redirect(back("error=phone"));
  if (description.length < 3 || city.length < 2 || contactName.length < 2) redirect(back("error=invalid"));
  if (form.get("privacy") !== "on") redirect(back("error=privacy"));

  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_REQUEST_IMAGES);
  // مجموع الصور تحت حد جسم الطلب في Vercel (4.5 ميجابايت).
  if (files.reduce((s, f) => s + f.size, 0) > 4 * 1024 * 1024) redirect(back("error=upload"));
  const images: { buffer: Uint8Array; mime: string; ext: string }[] = [];
  for (const file of files) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(buffer.subarray(0, 16));
    if (!kind) redirect(back("error=upload"));
    images.push({ buffer, ...kind });
  }

  const qty = intOrNull(text(form, "quantity", 3));
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("ap_create_quote_request", {
    p_brand: optionalUuid(text(form, "brandId", 64)), p_model: optionalUuid(text(form, "modelId", 64)),
    p_year: intOrNull(text(form, "year", 4)), p_engine: text(form, "engine", 80) || null, p_vin: vin,
    p_part_number: text(form, "partNumber", 60) || null, p_description: description,
    p_quantity: qty && qty > 0 ? qty : 1, p_city: city, p_contact_name: contactName, p_contact_phone: phone,
    p_privacy_accepted: true,
    p_product: optionalUuid(text(form, "productId", 64)), p_offer: optionalUuid(text(form, "offerId", 64)),
  });
  if (error || typeof id !== "string") redirect(back(fail(error?.message ?? "failed")));

  // الطلب أُنشئ؛ فشل رفع صورة لا يلغيه، بل يُبلَّغ العميل في صفحة الطلب.
  let uploadFailed = false;
  for (const img of images) {
    const path = `${session.userId}/${id}/${crypto.randomUUID()}.${img.ext}`;
    const { error: upErr } = await supabase.storage.from("ap-request-media").upload(path, img.buffer, { contentType: img.mime, upsert: false });
    const { error: addErr } = upErr ? { error: upErr } : await supabase.rpc("ap_add_request_media", { p_request: id, p_path: path, p_mime: img.mime });
    if (addErr) {
      uploadFailed = true;
      if (!upErr) await supabase.storage.from("ap-request-media").remove([path]);
    }
  }
  revalidatePath("/[locale]/admin", "layout");
  redirect(`${localePath(locale, `/account/requests/${id}`)}?${uploadFailed ? "error=upload" : "created=1"}`);
}

export async function cancelQuoteRequest(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/account/requests");
  const id = uuid.safeParse(text(form, "requestId", 64));
  if (!id.success) redirect(localePath(locale, "/account/requests"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_cancel_quote_request", { p_request: id.data });
  redirect(`${localePath(locale, `/account/requests/${id.data}`)}?${error ? fail(error.message) : "done=1"}`);
}

export async function acceptCustomerQuote(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/account/requests");
  const request = uuid.safeParse(text(form, "requestId", 64));
  const quote = uuid.safeParse(text(form, "quoteId", 64));
  if (!request.success || !quote.success) redirect(localePath(locale, "/account/requests"));
  const page = localePath(locale, `/account/requests/${request.data}`);
  if (form.get("agree") !== "on") redirect(`${page}?error=agree`);
  const supabase = await createClient();
  const { data: order, error } = await supabase.rpc("ap_accept_customer_quote", { p_quote: quote.data });
  if (error || typeof order !== "string") redirect(`${page}?${fail(error?.message ?? "failed")}`);
  redirect(`${localePath(locale, "/account/orders")}?created=${order}`);
}

export async function declineCustomerQuote(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/account/requests");
  const request = uuid.safeParse(text(form, "requestId", 64));
  const quote = uuid.safeParse(text(form, "quoteId", 64));
  if (!request.success || !quote.success) redirect(localePath(locale, "/account/requests"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_decline_customer_quote", { p_quote: quote.data, p_reason: text(form, "reason", 1000) || null });
  redirect(`${localePath(locale, `/account/requests/${request.data}`)}?${error ? fail(error.message) : "done=1"}`);
}

// ───────── الإدارة ─────────
const adminPage = (locale: string, id: string, q: string, hash = "") => `${localePath(locale, `/admin/quotes/${id}`)}?${q}${hash}`;

async function adminRequest(form: FormData) {
  const locale = formLocale(form);
  await requireStaff(locale, "/admin/quotes", "quotes.manage");
  const id = uuid.safeParse(text(form, "requestId", 64));
  if (!id.success) redirect(localePath(locale, "/admin/quotes"));
  return { locale, id: id.data, supabase: await createClient() };
}

export async function updateRequestStatus(form: FormData) {
  const { locale, id, supabase } = await adminRequest(form);
  const status = z.enum(adminSettableStatuses).safeParse(form.get("status"));
  if (!status.success) redirect(adminPage(locale, id, "error=invalid"));
  const { error } = await supabase.rpc("ap_admin_update_request_status", {
    p_request: id, p_status: status.data, p_notes: text(form, "notes", 2000) || null,
  });
  revalidatePath("/[locale]/admin", "layout");
  redirect(adminPage(locale, id, error ? fail(error.message) : "done=1"));
}

export async function sendToSuppliers(form: FormData) {
  const { locale, id, supabase } = await adminRequest(form);
  const orgs = form.getAll("orgs").map(String).filter((v) => uuid.safeParse(v).success).slice(0, 30);
  if (orgs.length === 0) redirect(adminPage(locale, id, "error=noSuppliers", "#suppliers"));
  const { error } = await supabase.rpc("ap_admin_send_request_to_suppliers", {
    p_request: id, p_orgs: orgs, p_share_vin: form.get("shareVin") === "on",
  });
  redirect(adminPage(locale, id, error ? fail(error.message) : "done=1", "#suppliers"));
}

export async function createCustomerQuote(form: FormData) {
  const { locale, id, supabase } = await adminRequest(form);
  const { error } = await supabase.rpc("ap_admin_create_customer_quote", {
    p_request: id, p_supplier_quote: optionalUuid(text(form, "supplierQuoteId", 64)),
  });
  redirect(adminPage(locale, id, error ? fail(error.message) : "done=1", "#draft"));
}

export async function saveQuoteLines(form: FormData) {
  const { locale, id, supabase } = await adminRequest(form);
  const quote = uuid.safeParse(text(form, "quoteId", 64));
  const rows = Number(text(form, "rows", 3)) || 0;
  const lines = parseQuoteLines((k) => text(form, k, 300), rows);
  if (!quote.success || !lines) redirect(adminPage(locale, id, "error=lines", "#draft"));
  const { error } = await supabase.rpc("ap_admin_set_quote_lines", { p_quote: quote.data, p_lines: lines });
  redirect(adminPage(locale, id, error ? fail(error.message) : "saved=1", "#draft"));
}

export async function issueCustomerQuote(form: FormData) {
  const { locale, id, supabase } = await adminRequest(form);
  const quote = uuid.safeParse(text(form, "quoteId", 64));
  const validUntil = endOfDayRiyadh(text(form, "validUntil", 10));
  if (!quote.success || !validUntil) redirect(adminPage(locale, id, "error=invalid", "#draft"));
  const { error } = await supabase.rpc("ap_admin_issue_customer_quote", {
    p_quote: quote.data, p_valid_until: validUntil, p_estimated_delivery_days: intOrNull(text(form, "deliveryDays", 3)),
    p_cancellation_terms: text(form, "cancellationTerms", 2000), p_seller_of_record: text(form, "sellerOfRecord", 200),
    p_notes: text(form, "notes", 2000) || null,
  });
  revalidatePath("/[locale]/admin", "layout");
  redirect(adminPage(locale, id, error ? fail(error.message) : "issued=1"));
}

// ───────── المورد ─────────
export async function submitSupplierQuote(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/partner/requests");
  const request = uuid.safeParse(text(form, "requestId", 64));
  const org = uuid.safeParse(text(form, "organizationId", 64));
  if (!request.success || !org.success) redirect(localePath(locale, "/partner/requests"));
  const page = (q: string) => `${localePath(locale, `/partner/requests/${request.data}`)}?${q}`;
  const partType = form.get("partType");
  const currency = z.enum(currencies).safeParse(form.get("currency"));
  const price = text(form, "unitPrice", 14);
  const validUntil = endOfDayRiyadh(text(form, "validUntil", 10));
  if (!isPartType(partType) || !currency.success || !/^\d{1,9}(\.\d{1,2})?$/.test(price) || Number(price) <= 0 || !validUntil) {
    redirect(page("error=invalid"));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_submit_supplier_quote", {
    p_request: request.data, p_org: org.data, p_part_type: partType, p_unit_price: Number(price), p_currency: currency.data,
    p_quantity_available: intOrNull(text(form, "quantityAvailable", 4)), p_lead_time_days: intOrNull(text(form, "leadTimeDays", 3)),
    p_origin_country: text(form, "originCountry", 2) || null, p_valid_until: validUntil,
    p_compatibility_notes: text(form, "notes", 2000) || null,
  });
  redirect(page(error ? fail(error.message) : "saved=1"));
}

export async function withdrawSupplierQuote(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/partner/requests");
  const request = uuid.safeParse(text(form, "requestId", 64));
  const quote = uuid.safeParse(text(form, "quoteId", 64));
  if (!request.success || !quote.success) redirect(localePath(locale, "/partner/requests"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_withdraw_supplier_quote", { p_quote: quote.data });
  redirect(`${localePath(locale, `/partner/requests/${request.data}`)}?${error ? fail(error.message) : "saved=1"}`);
}
