"use server";

import { redirect } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { CATALOG_TAG } from "@/lib/catalog-data";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { localePath, requireSession, requireStaff } from "@/lib/auth";
import { currencies, identifierKinds, isPartType, offerStatuses, parsePartNumbers, sniffImage } from "@/lib/catalog";
import { isLocale } from "@/i18n/locales";
import { formLocale, text } from "./form";

const uuid = z.uuid();
const productPage = (locale: string, id: string, query: string) => `${localePath(locale, `/partner/products/${id}`)}?${query}`;
const fail = (message: string) => `error=${encodeURIComponent(message.replace(/^ap: /, ""))}`;
const intOrNull = (v: string) => (/^\d{1,4}$/.test(v) ? Number(v) : null);

// ───────── منتجات الشريك ─────────
export async function createProduct(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/partner/products/new");
  const org = uuid.safeParse(text(form, "organizationId", 64));
  const brand = uuid.safeParse(text(form, "brandId", 64));
  const category = uuid.safeParse(text(form, "categoryId", 64));
  const name = text(form, "name", 200);
  if (!org.success || !brand.success || !category.success || name.length < 2) {
    redirect(`${localePath(locale, "/partner/products/new")}?error=invalid`);
  }
  const language = isLocale(form.get("language")) ? String(form.get("language")) : locale;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_create_product", {
    p_org: org.data, p_brand: brand.data, p_category: category.data, p_name: name,
    p_description: text(form, "description", 4000) || null, p_language: language,
  });
  if (error || typeof data !== "string") redirect(`${localePath(locale, "/partner/products/new")}?${fail(error?.message ?? "failed")}`);
  redirect(productPage(locale, data, "saved=1"));
}

export async function updateProduct(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/partner/products");
  const id = uuid.safeParse(text(form, "productId", 64));
  const brand = uuid.safeParse(text(form, "brandId", 64));
  const category = uuid.safeParse(text(form, "categoryId", 64));
  if (!id.success) redirect(localePath(locale, "/partner/products"));
  if (!brand.success || !category.success) redirect(productPage(locale, id.data, "error=invalid"));

  const identifiers = identifierKinds.flatMap((kind) =>
    parsePartNumbers(text(form, `ids_${kind}`, 2000)).map((value) => ({ kind, value })),
  );
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_update_product", {
    p_product: id.data, p_brand: brand.data, p_category: category.data,
    p_name: text(form, "name", 200), p_description: text(form, "description", 4000) || null,
  });
  const { error: idError } = error ? { error } : await supabase.rpc("ap_set_product_identifiers", { p_product: id.data, p_identifiers: identifiers });
  redirect(productPage(locale, id.data, error || idError ? fail((error ?? idError)!.message) : "saved=1"));
}

export async function addFitment(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/partner/products");
  const id = uuid.safeParse(text(form, "productId", 64));
  const model = uuid.safeParse(text(form, "modelId", 64));
  if (!id.success) redirect(localePath(locale, "/partner/products"));
  if (!model.success) redirect(productPage(locale, id.data, "error=invalid#fitments"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_add_fitment", {
    p_product: id.data, p_model: model.data,
    p_year_from: intOrNull(text(form, "yearFrom", 4)), p_year_to: intOrNull(text(form, "yearTo", 4)),
    p_engine: text(form, "engine", 80) || null, p_notes: null,
  });
  redirect(productPage(locale, id.data, `${error ? fail(error.message) : "saved=1"}#fitments`));
}

export async function removeFitment(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/partner/products");
  const id = uuid.safeParse(text(form, "productId", 64));
  const fitment = uuid.safeParse(text(form, "fitmentId", 64));
  if (!id.success || !fitment.success) redirect(localePath(locale, "/partner/products"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_remove_fitment", { p_fitment: fitment.data });
  redirect(productPage(locale, id.data, `${error ? fail(error.message) : "saved=1"}#fitments`));
}

export async function uploadProductImage(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/partner/products");
  const id = uuid.safeParse(text(form, "productId", 64));
  if (!id.success) redirect(localePath(locale, "/partner/products"));
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024) redirect(productPage(locale, id.data, "error=upload#images"));
  const buffer = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(buffer.subarray(0, 16));
  if (!kind) redirect(productPage(locale, id.data, "error=upload#images"));

  const supabase = await createClient();
  const path = `${id.data}/${crypto.randomUUID()}.${kind.ext}`;
  const { error: upErr } = await supabase.storage.from("ap-product-media").upload(path, buffer, { contentType: kind.mime, upsert: false });
  if (upErr) redirect(productPage(locale, id.data, "error=upload#images"));
  const { error } = await supabase.rpc("ap_add_product_media", { p_product: id.data, p_path: path });
  if (error) {
    await supabase.storage.from("ap-product-media").remove([path]);
    redirect(productPage(locale, id.data, `${fail(error.message)}#images`));
  }
  redirect(productPage(locale, id.data, "saved=1#images"));
}

export async function removeProductImage(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/partner/products");
  const id = uuid.safeParse(text(form, "productId", 64));
  const media = uuid.safeParse(text(form, "mediaId", 64));
  if (!id.success || !media.success) redirect(localePath(locale, "/partner/products"));
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("ap_remove_product_media", { p_media: media.data });
  if (!error && typeof path === "string") await supabase.storage.from("ap-product-media").remove([path]);
  redirect(productPage(locale, id.data, `${error ? fail(error.message) : "saved=1"}#images`));
}

export async function submitProduct(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/partner/products");
  const id = uuid.safeParse(text(form, "productId", 64));
  if (!id.success) redirect(localePath(locale, "/partner/products"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_submit_product", { p_product: id.data });
  revalidatePath("/[locale]/admin", "layout");
  redirect(productPage(locale, id.data, error ? fail(error.message) : "saved=1"));
}

// ───────── العروض والتوفر ─────────
export async function saveOffer(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/partner/products");
  const product = uuid.safeParse(text(form, "productId", 64));
  const org = uuid.safeParse(text(form, "organizationId", 64));
  const offerId = text(form, "offerId", 64);
  if (!product.success || !org.success) redirect(localePath(locale, "/partner/products"));
  const partType = form.get("partType");
  const status = z.enum(offerStatuses).safeParse(form.get("status"));
  const currency = z.enum(currencies).safeParse(form.get("currency"));
  const price = text(form, "unitPrice", 14);
  const validUntil = text(form, "validUntil", 10);
  if (!isPartType(partType) || !status.success || !currency.success || (price && !/^\d{1,9}(\.\d{1,2})?$/.test(price))) {
    redirect(productPage(locale, product.data, "error=invalid#offers"));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_save_offer", {
    p_id: uuid.safeParse(offerId).success ? offerId : null,
    p_product: product.data, p_org: org.data, p_part_type: partType,
    p_unit_price: price ? Number(price) : null, p_currency: currency.data,
    p_origin_country: text(form, "originCountry", 2) || null,
    p_lead_time_days: intOrNull(text(form, "leadTimeDays", 3)),
    p_valid_until: /^\d{4}-\d{2}-\d{2}$/.test(validUntil) ? `${validUntil}T23:59:59+03:00` : null,
    p_status: status.data, p_notes: text(form, "notes", 1000) || null,
  });
  redirect(productPage(locale, product.data, `${error ? fail(error.message) : "saved=1"}#offers`));
}

export async function confirmAvailability(form: FormData) {
  const locale = formLocale(form);
  await requireSession(locale, "/partner/products");
  const product = uuid.safeParse(text(form, "productId", 64));
  const offer = uuid.safeParse(text(form, "offerId", 64));
  const status = z.enum(["available", "out_of_stock", "on_request"]).safeParse(form.get("availability"));
  if (!product.success || !offer.success) redirect(localePath(locale, "/partner/products"));
  if (!status.success) redirect(productPage(locale, product.data, "error=invalid#offers"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_confirm_availability", {
    p_offer: offer.data, p_status: status.data, p_quantity: intOrNull(text(form, "quantity", 6)),
  });
  redirect(productPage(locale, product.data, `${error ? fail(error.message) : "saved=1"}#offers`));
}

// ───────── الإدارة ─────────
export async function reviewProduct(form: FormData) {
  const locale = formLocale(form);
  await requireStaff(locale, "/admin/products", "products.publish");
  const id = uuid.safeParse(text(form, "productId", 64));
  const decision = z.enum(["published", "rejected", "suspended"]).safeParse(form.get("decision"));
  const back = `${localePath(locale, "/admin/products")}?status=${encodeURIComponent(text(form, "status", 20) || "pending_review")}`;
  if (!id.success || !decision.success) redirect(`${back}&error=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_admin_review_product", {
    p_product: id.data, p_decision: decision.data, p_reason: text(form, "reason", 1000) || null,
  });
  revalidatePath("/[locale]/products", "layout");
  redirect(`${back}&${error ? fail(error.message) : "done=1"}`);
}

export async function saveModel(form: FormData) {
  const locale = formLocale(form);
  await requireStaff(locale, "/admin/catalog", "products.publish");
  const brand = uuid.safeParse(text(form, "brandId", 64));
  const name = text(form, "name", 80);
  const back = localePath(locale, "/admin/catalog");
  if (!brand.success || !name) redirect(`${back}?error=invalid`);
  const id = text(form, "modelId", 64);
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_admin_upsert_model", {
    p_id: uuid.safeParse(id).success ? id : null, p_brand: brand.data, p_name: name,
    p_name_ar: text(form, "nameAr", 80) || null,
    p_year_from: intOrNull(text(form, "yearFrom", 4)), p_year_to: intOrNull(text(form, "yearTo", 4)),
    p_enabled: form.get("enabled") === "on",
  });
  updateTag(CATALOG_TAG);
  revalidatePath("/[locale]/products", "layout");
  redirect(`${back}?${error ? fail(error.message) : "done=1"}`);
}
