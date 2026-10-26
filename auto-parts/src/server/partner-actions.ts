"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { localePath, requireSession } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, documentTypes, isCapability, safeFileName, selfCapabilities, sniffDocument } from "@/lib/partners";
import { formLocale, text } from "./form";

const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
const appPage = (locale: string, query = "") => `${localePath(locale, "/partner/application")}${query ? `?${query}` : ""}`;

// قبول الدعوة ينشئ المنشأة وطلب الاعتماد معًا. قاعدة البيانات تتحقق أن البريد هو البريد المدعو وأن الدعوة صالحة.
export async function acceptInvitation(form: FormData) {
  const locale = formLocale(form);
  const token = tokenSchema.safeParse(text(form, "token", 64));
  const legalName = text(form, "legalName", 200);
  const country = text(form, "country", 2).toUpperCase();
  if (!token.success) redirect(localePath(locale, "/"));
  const invitePage = localePath(locale, `/invite/${token.data}`);
  await requireSession(locale, `/invite/${token.data}`);
  if (legalName.length < 2 || !/^[A-Z]{2}$/.test(country)) redirect(`${invitePage}?error=1`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_accept_invitation", { p_token: token.data, p_legal_name: legalName, p_country_code: country });
  if (error) redirect(`${invitePage}?error=1`);
  redirect(appPage(locale));
}

// التسجيل الذاتي كشريك (رابط /join): ينشئ المنشأة وطلب الاعتماد كما تفعل الدعوة، والاعتماد يبقى بيد الإدارة.
export async function registerAsPartner(form: FormData) {
  const locale = formLocale(form);
  const page = localePath(locale, "/join");
  await requireSession(locale, "/join");
  const legalName = text(form, "legalName", 200);
  const country = text(form, "country", 2).toUpperCase();
  const caps = form.getAll("capabilities").filter((c): c is (typeof selfCapabilities)[number] =>
    typeof c === "string" && (selfCapabilities as readonly string[]).includes(c));
  if (legalName.length < 2 || !/^[A-Z]{2}$/.test(country) || caps.length === 0) redirect(`${page}?error=invalid`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_partner_self_register", {
    p_legal_name: legalName, p_country_code: country, p_capabilities: [...new Set(caps)], p_locale: locale,
  });
  if (error) redirect(`${page}?error=${/already partner/.test(error.message) ? "already" : /not confirmed/.test(error.message) ? "confirm" : "failed"}`);
  redirect(appPage(locale, "started=1"));
}

const optional = (max: number) => z.string().max(max).transform((v) => v.trim());
const applicationSchema = z.object({
  legal_name: z.string().trim().min(2).max(200),
  trade_name: optional(200),
  entity_type: optional(80),
  country_code: z.string().regex(/^[A-Za-z]{2}$/),
  registered_address: optional(500),
  operating_country: z.union([z.literal(""), z.string().regex(/^[A-Za-z]{2}$/)]),
  website: z.union([z.literal(""), z.url().max(300)]),
  activity_description: optional(2000),
  billing_currency: z.union([z.literal(""), z.string().regex(/^[A-Za-z]{3}$/)]),
  contact_name: optional(120),
  contact_title: optional(120),
  contact_phone: z.union([z.literal(""), z.string().regex(/^\+?[0-9 ]{6,20}$/)]),
  contact_email: z.union([z.literal(""), z.email().max(254)]),
});

async function editableApplication(locale: string) {
  const session = await requireSession(locale, "/partner/application");
  const supabase = await createClient();
  const { data: app } = await supabase
    .from("ap_partner_applications")
    .select("id, organization_id, status")
    .eq("submitted_by", session.userId)
    .maybeSingle();
  if (!app) redirect(localePath(locale, "/partner"));
  return { supabase, app };
}

export async function saveApplication(form: FormData) {
  const locale = formLocale(form);
  const { supabase, app } = await editableApplication(locale);
  const raw = Object.fromEntries(Object.keys(applicationSchema.shape).map((k) => [k, text(form, k, 2000)]));
  const parsed = applicationSchema.safeParse(raw);
  if (!parsed.success) redirect(appPage(locale, `error=${encodeURIComponent(String(parsed.error.issues[0]?.path[0] ?? ""))}`));
  const caps = form.getAll("capabilities").filter(isCapability);
  const languages = form.getAll("languages").map(String).slice(0, 10);

  const { error } = await supabase.rpc("ap_save_application", {
    p_app: app.id,
    p_data: { ...parsed.data, languages, declaration: form.get("declaration") === "on" },
    p_capabilities: caps.length > 0 ? caps : null,
  });
  revalidatePath("/[locale]/partner", "layout");
  redirect(appPage(locale, error ? "error=save" : "saved=1"));
}

export async function submitApplication(form: FormData) {
  const locale = formLocale(form);
  const { supabase, app } = await editableApplication(locale);
  const { error } = await supabase.rpc("ap_submit_application", { p_app: app.id });
  revalidatePath("/[locale]/partner", "layout");
  if (error) {
    const missing = error.message.match(/incomplete application: (.+)$/)?.[1];
    redirect(appPage(locale, missing ? `missing=${encodeURIComponent(missing)}` : "error=submit"));
  }
  redirect(appPage(locale, "submitted=1"));
}

// الرفع يمر بالخادم: يُفحص نوع الملف من محتواه وحجمه، ثم يُرفع بجلسة المستخدم (سياسات التخزين تتحقق من المنشأة وحالة الطلب).
export async function uploadDocument(form: FormData) {
  const locale = formLocale(form);
  const { supabase, app } = await editableApplication(locale);
  const file = form.get("file");
  const docType = text(form, "documentType", 40);
  const issuing = text(form, "issuingCountry", 2).toUpperCase();
  const expiry = text(form, "expiry", 10);
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_UPLOAD_BYTES || !(documentTypes as readonly string[]).includes(docType)) {
    redirect(appPage(locale, "error=upload"));
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  const kind = sniffDocument(buffer.subarray(0, 16));
  if (!kind) redirect(appPage(locale, "error=upload"));

  const path = `${app.organization_id}/${crypto.randomUUID()}.${kind.ext}`;
  const { error: upErr } = await supabase.storage
    .from("ap-verification-docs")
    .upload(path, buffer, { contentType: kind.mime, upsert: false });
  if (upErr) redirect(appPage(locale, "error=upload"));

  const { error } = await supabase.rpc("ap_add_document", {
    p_app: app.id,
    p_type: docType,
    p_path: path,
    p_file_name: safeFileName(file.name),
    p_mime: kind.mime,
    p_size: file.size,
    p_issuing_country: /^[A-Z]{2}$/.test(issuing) ? issuing : null,
    p_expiry: /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null,
  });
  if (error) {
    await supabase.storage.from("ap-verification-docs").remove([path]);
    redirect(appPage(locale, "error=upload"));
  }
  redirect(appPage(locale, "saved=1#documents"));
}

export async function removeDocument(form: FormData) {
  const locale = formLocale(form);
  const { supabase } = await editableApplication(locale);
  const id = z.uuid().safeParse(text(form, "documentId", 64));
  if (!id.success) redirect(appPage(locale, "error=save"));
  const { data: path, error } = await supabase.rpc("ap_remove_document", { p_doc: id.data });
  if (!error && typeof path === "string") await supabase.storage.from("ap-verification-docs").remove([path]);
  redirect(appPage(locale, error ? "error=save" : "saved=1#documents"));
}

export async function markNotificationsRead(form: FormData) {
  const locale = formLocale(form);
  const session = await requireSession(locale, "/partner");
  const supabase = await createClient();
  await supabase.from("ap_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", session.userId).is("read_at", null);
  redirect(localePath(locale, "/partner"));
}

