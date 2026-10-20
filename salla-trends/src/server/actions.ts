"use server";
// إجراءات النماذج (Server Actions). Next.js يتحقق من أصل الطلب تلقائيًا، وكل إجراء يتحقق من الجلسة بنفسه.
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MAX_DOCUMENT_BYTES, normalizeVerificationNumber, safeFileName, sniffDocument, VERIFICATION_KINDS, type VerificationKind } from "@/lib/verification";
import { DUMMY_HASH, verifyPassword } from "./auth/password";
import { endSession, requireAdmin, requireStore, startAdminSession } from "./auth/session";
import { anonymous, asAdmin, asStore } from "./db";
import { env } from "./env";
import { clientIp, rateLimited } from "./http";

// values: ما كتبه المستخدم، يعود مع الخطأ لأن React يفرّغ النموذج بعد كل إرسال
export type FormState = { ok?: boolean; error?: string; message?: string; values?: Record<string, string> } | undefined;

export async function logout() {
  await endSession();
  redirect("/");
}

// الموافقة على المشاركة أو سحبها. السحب يُخرج مبيعات المتجر من الحساب القادم للترند ويوقف رؤيته له.
export async function setConsent(formData: FormData) {
  const v = await requireStore();
  const on = formData.get("contributes") === "on";
  await asStore(v.storeId, async (tx) => {
    await tx.q("UPDATE stores SET contributes = $1, consent_at = CASE WHEN $1 THEN now() ELSE NULL END, updated_at = now() WHERE id = app.current_store()", [on]);
    await tx.q("INSERT INTO audit_log (actor, action, target) VALUES ($1, $2, $1)", [`store:${v.storeId}`, on ? "consent.grant" : "consent.revoke"]);
  });
  revalidatePath("/", "layout");
  const back = String(formData.get("back") ?? "");
  if (back.startsWith("/") && !back.startsWith("//")) redirect(back);
}

export async function deleteMyData(_: FormState, formData: FormData): Promise<FormState> {
  const v = await requireStore();
  if (formData.get("confirm") !== "حذف") return { error: "اكتب كلمة «حذف» للتأكيد." };
  await asStore(v.storeId, async (tx) => {
    await tx.q("DELETE FROM order_lines WHERE store_id = app.current_store()");
    await tx.q("DELETE FROM products WHERE store_id = app.current_store()");
    await tx.q("UPDATE stores SET contributes = false, consent_at = NULL, updated_at = now() WHERE id = app.current_store()");
    await tx.q("INSERT INTO audit_log (actor, action, target) VALUES ($1, 'data.delete', $1)", [`store:${v.storeId}`]);
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "حُذفت بيانات المبيعات والمنتجات المخزنة لمتجرك، وأُوقفت المشاركة. الطلبات الجديدة لن تُحسب حتى توافق من جديد." };
}

const verificationSchema = z.object({
  kind: z.enum(Object.keys(VERIFICATION_KINDS) as [VerificationKind, ...VerificationKind[]]),
  number: z.string().min(1).max(40),
  legal_name: z.string().trim().min(2, "اكتب الاسم كما في الوثيقة").max(200),
});

export async function submitVerification(_: FormState, formData: FormData): Promise<FormState> {
  const v = await requireStore();
  const values = { number: String(formData.get("number") ?? ""), legal_name: String(formData.get("legal_name") ?? "") };
  const parsed = verificationSchema.safeParse({ kind: formData.get("kind"), number: formData.get("number"), legal_name: formData.get("legal_name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير مكتملة.", values };
  const number = normalizeVerificationNumber(parsed.data.kind, parsed.data.number);
  if (!number) return { error: `رقم ${VERIFICATION_KINDS[parsed.data.kind].name} غير صحيح. ${VERIFICATION_KINDS[parsed.data.kind].hint}`, values };
  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) return { error: "أرفق صورة الوثيقة أو ملف PDF.", values };
  if (file.size > MAX_DOCUMENT_BYTES) return { error: "حجم الملف أكبر من 4 ميجابايت.", values };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffDocument(bytes);
  if (!mime) return { error: "نوع الملف غير مدعوم. المسموح: PDF أو PNG أو JPG.", values };
  if (await rateLimited(`verify:${v.storeId}`, 5, 86400)) return { error: "قدمت طلبات كثيرة اليوم. حاول غدًا.", values };
  try {
    await asStore(v.storeId, async (tx) => {
      await tx.q(
        `INSERT INTO verification_requests (store_id, kind, number, legal_name, document, document_mime, document_name)
         VALUES (app.current_store(), $1, $2, $3, $4, $5, $6)`,
        [parsed.data.kind, number, parsed.data.legal_name, Buffer.from(bytes), mime, safeFileName(file.name)],
      );
      await tx.q("INSERT INTO audit_log (actor, action, target, details) VALUES ($1, 'verification.submit', $1, $2)", [
        `store:${v.storeId}`, { kind: parsed.data.kind },
      ]);
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { error: "لديك طلب قيد المراجعة بالفعل.", values };
    throw e;
  }
  revalidatePath("/verification");
  return { ok: true, message: "استلمنا طلبك، وسيراجعه فريق المنصة. ستظهر النتيجة في هذه الصفحة." };
}

export async function adminLogin(_: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp(await headers());
  if (await rateLimited(`admin-login:${ip}`, env().LOGIN_LIMIT_PER_15MIN, 900)) return { error: "محاولات كثيرة. انتظر ربع ساعة.", values: { email } };
  const row = await anonymous((tx) => tx.one<{ id: string; password_hash: string }>("SELECT * FROM app.admin_credentials($1)", [email]));
  // نتحقق دائمًا من هاش (حتى الوهمي) كي لا يكشف زمن الرد وجود البريد
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) return { error: "البريد أو كلمة المرور غير صحيحة.", values: { email } };
  await startAdminSession(row.id);
  redirect("/admin");
}

export async function reviewVerification(_: FormState, formData: FormData): Promise<FormState> {
  const a = await requireAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  const decision = formData.get("decision");
  const note = String(formData.get("note") ?? "").slice(0, 500);
  if (!id.success || (decision !== "approve" && decision !== "reject")) return { error: "طلب غير صالح." };
  if (decision === "reject" && note.trim().length < 3) return { error: "اكتب سبب الرفض ليعرف التاجر ما يصححه." };
  try {
    await asAdmin(a.adminId, (tx) => tx.q("SELECT app.review_verification($1, $2, $3)", [id.data, decision === "approve", note]));
  } catch (e) {
    if ((e as { code?: string }).code === "P0002") return { error: "الطلب لم يعد قيد المراجعة." };
    throw e;
  }
  revalidatePath("/admin/verifications");
  return { ok: true };
}
