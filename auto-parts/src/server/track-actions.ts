"use server";

import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/quotes";

export type TrackEvent = { status: string; location: string | null; occurred_at: string };
// input: ما أدخله المستخدم ليبقى في الحقول بعد الإرسال (React يعيد ضبط النموذج بعد كل إجراء).
type Input = { input: { reference: string; phone: string } };
export type TrackResult =
  | ({ state: "idle" } & Partial<Input>)
  | ({ state: "error"; code: "invalid" | "notFound" | "locked" | "failed" } & Input)
  | ({ state: "found"; reference: string; status: string; createdAt: string;
      shipment: { reference: string; status: string; carrier: string | null; tracking_number: string | null;
        estimated_delivery_at: string | null; delivered_at: string | null; events: TrackEvent[] } | null } & Input);

// تتبع بلا تسجيل دخول: رقم الطلب + جوال صاحب الطلب. قاعدة البيانات تعيد الحالة ومراحل الشحن فقط،
// وتقفل رقم الطلب بعد 10 محاولات خاطئة في الساعة.
export async function trackOrder(_prev: TrackResult, form: FormData): Promise<TrackResult> {
  const reference = String(form.get("reference") ?? "").trim().toUpperCase().slice(0, 20);
  const rawPhone = String(form.get("phone") ?? "").slice(0, 30);
  const input = { reference, phone: rawPhone };
  const phone = normalizePhone(rawPhone);
  if (!/^ORD-\d{6,}$/.test(reference) || !phone) return { state: "error", code: "invalid", input };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ap_track_order", { p_reference: reference, p_phone: phone });
  if (error) return { state: "error", code: /too many attempts/.test(error.message) ? "locked" : "failed", input };
  if (!data) return { state: "error", code: "notFound", input };
  const d = data as { reference: string; status: string; created_at: string; shipment: Extract<TrackResult, { state: "found" }>["shipment"] };
  return { state: "found", reference: d.reference, status: d.status, createdAt: d.created_at, shipment: d.shipment, input };
}
