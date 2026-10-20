// ثوابت طلبات التسعير والطلبات المشتركة بين الواجهة والخادم. القيم تطابق أنواع قاعدة البيانات.
export const requestStatuses = ["submitted", "reviewing", "sourcing", "quoted", "accepted", "declined", "expired", "cancelled"] as const;
export type RequestStatus = (typeof requestStatuses)[number];
export const openRequestStatuses: readonly RequestStatus[] = ["submitted", "reviewing", "sourcing", "quoted"];
export const adminSettableStatuses = ["reviewing", "sourcing", "expired", "cancelled"] as const;

export const costLineCodes = ["part", "international_shipping", "local_shipping", "customs", "tax", "service_fee", "discount", "other"] as const;
export type CostLineCode = (typeof costLineCodes)[number];
export const lineStatuses = ["confirmed", "estimated"] as const;
export type LineStatus = (typeof lineStatuses)[number];

export const orderStatuses = [
  "draft", "awaiting_payment", "paid", "processing", "ready_to_ship", "shipped", "in_transit", "customs_clearance",
  "out_for_delivery", "delivered", "completed", "cancelled", "refunded", "disputed",
] as const;

export const MAX_REQUEST_IMAGES = 3;
export const MAX_QUOTE_LINES = 30;

// رقم الهيكل: 17 خانة بلا I وO وQ. يُكتب بأحرف كبيرة وبلا مسافات.
export function normalizeVin(input: string): string | null {
  const v = input.replace(/[\s-]/g, "").toUpperCase();
  if (!v) return null;
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? v : "invalid";
}

// الجوال بصيغة دولية +9665xxxxxxxx. يقبل 05xxxxxxxx (سعودي) و00 في البداية.
export function normalizePhone(input: string): string | null {
  let v = input.replace(/[\s()-]/g, "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  else if (/^05\d{8}$/.test(v)) v = `+966${v.slice(1)}`;
  else if (/^5\d{8}$/.test(v)) v = `+966${v}`;
  return /^\+[1-9]\d{7,14}$/.test(v) ? v : null;
}

export type QuoteLine = {
  code: CostLineCode;
  description: string | null;
  quantity: number;
  unit_amount: number;
  status: LineStatus;
  source: string | null;
  beneficiary: string | null;
};

const isCode = (v: unknown): v is CostLineCode => typeof v === "string" && (costLineCodes as readonly string[]).includes(v);

// بنود محرر التسعيرة: صفوف line_<field>_<i>. الصف بلا مبلغ يُتجاهل. الخصم يُحفظ سالبًا دائمًا.
// يعيد null إن وُجد صف غير صالح (مبلغ أو كمية أو نوع)، حتى لا تُحفظ تسعيرة ناقصة بصمت.
export function parseQuoteLines(get: (key: string) => string, rows: number): QuoteLine[] | null {
  const lines: QuoteLine[] = [];
  for (let i = 0; i < Math.min(rows, MAX_QUOTE_LINES); i++) {
    const amount = get(`line_amount_${i}`).replace(/,/g, "");
    if (!amount) continue;
    const code = get(`line_code_${i}`);
    const qty = get(`line_qty_${i}`) || "1";
    if (!isCode(code) || !/^-?\d{1,9}(\.\d{1,2})?$/.test(amount) || !/^\d{1,3}$/.test(qty) || Number(qty) < 1) return null;
    const value = Math.abs(Number(amount));
    lines.push({
      code,
      description: get(`line_desc_${i}`).slice(0, 300) || null,
      quantity: Number(qty),
      unit_amount: code === "discount" ? -value : value,
      status: get(`line_status_${i}`) === "estimated" ? "estimated" : "confirmed",
      source: get(`line_source_${i}`).slice(0, 200) || null,
      beneficiary: get(`line_beneficiary_${i}`).slice(0, 200) || null,
    });
  }
  return lines;
}

// للعرض فقط؛ قاعدة البيانات تحسب الإجمالي المعتمد عند الإصدار.
export function linesTotal(lines: { unit_amount: number | string; quantity: number }[]): number {
  return Math.round(lines.reduce((s, l) => s + Number(l.unit_amount) * l.quantity, 0) * 100) / 100;
}

export function isExpired(validUntil: string | null, now = Date.now()): boolean {
  return validUntil !== null && new Date(validUntil).getTime() <= now;
}

// تاريخ yyyy-mm-dd من نموذج → نهاية اليوم بتوقيت الرياض.
export function endOfDayRiyadh(date: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T23:59:59+03:00` : null;
}
