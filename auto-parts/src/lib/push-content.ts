// كوكي رمز جهاز الجوال: يُلغى تسجيله عند تسجيل الخروج.
export const PUSH_COOKIE = "ap_push_token";

// نص الإشعار الفوري ورابطه داخل المنصة، حسب نوع الإشعار ولغة المستخدم (دالة صافية تُختبر بلا خادم).
export type PushMessages = {
  push: Record<string, { title: string; body: string }>;
  orderStatus: Record<string, string>;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function target(kind: string, p: Record<string, unknown>): string {
  const id = (key: string) => (typeof p[key] === "string" && uuid.test(p[key] as string) ? (p[key] as string) : null);
  switch (kind) {
    case "customer_quote_issued":
      return id("request_id") ? `/account/requests/${id("request_id")}` : "/account/requests";
    case "order_status":
      return "/account/orders";
    case "quote_request_invited":
      return id("request_id") ? `/partner/requests/${id("request_id")}` : "/partner/requests";
    case "shipping_quote_requested":
      return id("shipping_quote_id") ? `/carrier/quotes/${id("shipping_quote_id")}` : "/carrier";
    case "shipment_assigned":
      return id("shipment_id") ? `/carrier/shipments/${id("shipment_id")}` : "/carrier";
    case "payment_reported":
      return id("order_id") ? `/admin/orders/${id("order_id")}#payment` : "/admin/orders";
    default:
      return kind.startsWith("application_") ? "/partner/application" : "/account";
  }
}

export function pushText(m: PushMessages, kind: string, payload: Record<string, unknown>, locale: string) {
  const t = m.push[kind] ?? m.push.default;
  const reference = typeof payload.reference === "string" ? payload.reference.slice(0, 40) : "";
  const status = typeof payload.status === "string" ? m.orderStatus[payload.status] ?? "" : "";
  const fill = (s: string) => s.replace("{reference}", reference).replace("{status}", status).replace(/\s+/g, " ").trim();
  return { title: fill(t.title), body: fill(t.body), path: `${locale === "ar" ? "" : `/${locale}`}${target(kind, payload)}` };
}
