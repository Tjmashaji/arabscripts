// ثوابت الشحن المشتركة بين الواجهة والخادم. القيم تطابق أنواع قاعدة البيانات.
export const shippingModes = ["air", "sea", "express", "land"] as const;
export type ShippingMode = (typeof shippingModes)[number];
export const shipmentPath = ["assigned", "accepted", "picked_up", "in_transit", "customs_clearance", "out_for_delivery", "delivered"] as const;
export const shipmentStatuses = [...shipmentPath, "failed", "returned", "cancelled"] as const;
export type ShipmentStatus = (typeof shipmentStatuses)[number];
export const closedShipmentStatuses: readonly ShipmentStatus[] = ["delivered", "failed", "returned", "cancelled"];
export const shipmentDocKinds = ["proof_of_delivery", "invoice", "waybill", "other"] as const;
export const paymentMethods = ["bank_transfer", "cash_on_delivery", "other"] as const;
// حالات يغيّرها المدير يدويًا (البقية تأتي من الدفع والشحنة). قاعدة البيانات تتحقق من الانتقال الفعلي.
export const adminOrderTargets = ["processing", "ready_to_ship", "cancelled", "completed", "disputed"] as const;
export const supplierOrderTargets = ["processing", "ready_to_ship"] as const;

// الحالات التالية المتاحة للشحنة من حالتها الحالية: التقدم في المسار (الجمارك اختيارية) أو الفشل/الإرجاع.
export function nextShipmentStatuses(current: ShipmentStatus, isAdmin: boolean): ShipmentStatus[] {
  if (closedShipmentStatuses.includes(current)) return [];
  const rank = (shipmentPath as readonly string[]).indexOf(current);
  const forward = shipmentPath.slice(rank + 1) as ShipmentStatus[];
  const back: ShipmentStatus[] = current === "customs_clearance" ? ["in_transit"] : [];
  const cancel: ShipmentStatus[] = isAdmin && (current === "assigned" || current === "accepted") ? ["cancelled"] : [];
  return [...back, ...forward, "failed", "returned", ...cancel];
}

// الوزن المحتسب = الأكبر من الفعلي والحجمي.
export function chargeableWeight(actual: number | string | null, volumetric: number | string | null): number | null {
  const values = [actual, volumetric].map((v) => (v === null || v === "" ? NaN : Number(v))).filter((v) => Number.isFinite(v));
  return values.length ? Math.max(...values) : null;
}

// الوزن الحجمي القياسي للشحن الجوي: الطول × العرض × الارتفاع (سم) ÷ 5000.
export function volumetricWeight(l: number, w: number, h: number, divisor = 5000): number {
  return Math.round(((l * w * h) / divisor) * 1000) / 1000;
}

export function countryList(input: string): string[] | null {
  const items = [...new Set(input.toUpperCase().split(/[\s,،]+/).filter(Boolean))];
  return items.every((c) => /^[A-Z]{2}$/.test(c)) && items.length <= 30 ? items : null;
}

// خلية CSV آمنة: اقتباس، ومنع حقن الصيغ في Excel (= + - @ في البداية).
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const SHIPMENT_SELECT = `id, reference, status, carrier_id, carrier_name, mode, tracking_number, pieces, weight_kg, volumetric_weight_kg,
  recipient_name, recipient_phone, destination_city, destination_address, estimated_delivery_at, delivered_at, created_at,
  ap_shipment_events(id, status, location, note, source, occurred_at), ap_shipment_documents(id, kind, file_name, created_at)`;
