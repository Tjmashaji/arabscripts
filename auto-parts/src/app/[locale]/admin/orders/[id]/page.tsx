import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SubmitButton } from "@/components/submit-button";
import { QuoteBreakdown, type QuoteLineRow } from "@/components/quote-breakdown";
import { ShipmentPanel, type ShipmentRow } from "@/components/shipment-panel";
import { Alert, Badge, Card, Field, Input, PageTitle, Select, Textarea, statusTone } from "@/components/ui";
import { localePath, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/catalog";
import { adminOrderTargets, closedShipmentStatuses, paymentMethods, SHIPMENT_SELECT, shippingModes } from "@/lib/shipping";
import { createShipment, recordPayment, setOrderStatus } from "@/server/shipping-actions";
import { errorMessage } from "@/lib/errors";
import { localeFrom } from "@/i18n/locales";

type Order = {
  id: string; reference: string; status: string; payment_status: string; total: string; currency: string; created_at: string;
  request_id: string; supplier_org_id: string | null; shipping_quote_id: string | null;
  ap_order_items: QuoteLineRow[];
  ap_order_status_history: { id: number; from_status: string | null; to_status: string; note: string | null; changed_at: string }[];
  ap_payments: { id: string; amount: string; currency: string; method: string; reference: string; received_by: string; status: string; recorded_at: string }[];
};
type ShippingQuote = { id: string; carrier_id: string | null; carrier_name: string | null; mode: string; pieces: number; weight_kg: string;
  volumetric_weight_kg: string | null; delivery_estimate_days: number | null };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "adminOrders" }))("title") };
}

// إدارة الطلب: الحالة وانتقالاتها، تسجيل الدفع (المالية)، إنشاء الشحنة ومتابعتها (إدارة الشحن).
export default async function AdminOrder({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ done?: string; saved?: string; error?: string }>;
}) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await requireStaff(locale, `/admin/orders/${id}`);
  const can = (p: string) => session.permissions.has(p);
  if (!can("orders.manage_all") && !can("finance.manage")) redirect(localePath(locale, "/forbidden"));
  const q = await searchParams;
  const t = await getTranslations("adminOrders");
  const tq = await getTranslations("quotes");
  const to = await getTranslations("orderStatus");
  const tsh = await getTranslations("shipping");
  const tm = await getTranslations("shippingModes");
  const supabase = await createClient();
  const { data } = await supabase
    .from("ap_orders")
    .select("id, reference, status, payment_status, total, currency, created_at, request_id, supplier_org_id, shipping_quote_id, ap_order_items(id, code, description, quantity, unit_amount, amount, status, sort_order), ap_order_status_history(id, from_status, to_status, note, changed_at), ap_payments(id, amount, currency, method, reference, received_by, status, recorded_at)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const order = data as Order;
  const [{ data: req }, { data: shipmentRows }, { data: sqRow }, { data: orgRows }] = await Promise.all([
    supabase.from("ap_quote_requests").select("id, reference, contact_name, contact_phone, city").eq("id", order.request_id).maybeSingle(),
    supabase.from("ap_shipments").select(SHIPMENT_SELECT).eq("order_id", id).order("created_at", { ascending: false }),
    order.shipping_quote_id
      ? supabase.from("ap_shipping_quotes").select("id, carrier_id, carrier_name, mode, pieces, weight_kg, volumetric_weight_kg, delivery_estimate_days").eq("id", order.shipping_quote_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("ap_organizations").select("id, legal_name, trade_name, ap_organization_verifications(capability, status)").eq("status", "active"),
  ]);
  const shipments = (shipmentRows ?? []) as unknown as (ShipmentRow & { carrier_id: string | null })[];
  const shippingQuote = sqRow as ShippingQuote | null;
  const orgs = (orgRows ?? []) as { id: string; legal_name: string; trade_name: string | null; ap_organization_verifications: { capability: string; status: string }[] }[];
  const orgName = new Map(orgs.map((o) => [o.id, o.trade_name || o.legal_name]));
  const carriers = orgs.filter((o) => o.ap_organization_verifications.some((v) => v.capability === "carrier" && v.status === "approved"));
  const active = shipments.find((s) => !closedShipmentStatuses.includes(s.status) || s.status === "delivered");
  const canShip = can("shipping.manage") && order.payment_status === "paid" && order.status === "ready_to_ship" && !active;
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const history = [...order.ap_order_status_history].sort((a, b) => a.changed_at.localeCompare(b.changed_at));
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="orderId" value={order.id} />
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/orders" className="text-sm text-accent">← {t("title")}</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle><span className="ltr-value">{order.reference}</span></PageTitle>
        <div className="flex gap-2">
          <Badge tone={statusTone(order.status)}>{to(order.status)}</Badge>
          <Badge tone={order.payment_status === "paid" ? "success" : "neutral"}>{tq(`payment_${order.payment_status}`)}</Badge>
        </div>
      </div>
      {(q.done || q.saved) && <Alert tone="success">{t("done")}</Alert>}
      {q.error && <Alert tone="danger">{await errorMessage(q.error)}</Alert>}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">{tq("breakdown")}</h2>
          <QuoteBreakdown lines={order.ap_order_items} currency={order.currency} total={order.total} locale={locale} />
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {req && <div><dt className="text-xs text-muted">{t("request")}</dt><dd><Link href={`/admin/quotes/${req.id}`} className="text-accent ltr-value">{req.reference}</Link></dd></div>}
            <div><dt className="text-xs text-muted">{t("supplier")}</dt><dd>{order.supplier_org_id ? orgName.get(order.supplier_org_id) ?? "—" : "—"}</dd></div>
            {req && <div className="sm:col-span-2"><dt className="text-xs text-muted">{t("customer")}</dt><dd>{req.contact_name ?? "—"} · <span className="ltr-value">{req.contact_phone ?? "—"}</span> · {req.city}</dd></div>}
          </dl>
        </Card>

        <Card className="flex flex-col gap-3">
          <h2 className="font-bold">{t("statusTitle")}</h2>
          <ol className="flex flex-col gap-1 border-s-2 border-line ps-4 text-sm">
            {history.map((h) => (
              <li key={h.id}>
                <span className="font-bold">{to(h.to_status)}</span>
                <span className="ms-2 text-xs text-muted">{dateFmt.format(new Date(h.changed_at))}</span>
                {h.note && <p className="text-xs text-muted">{h.note}</p>}
              </li>
            ))}
          </ol>
          {can("orders.manage_all") && (
            <form action={setOrderStatus} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
              {hidden}
              <Select name="status" aria-label={t("statusTitle")}>
                {adminOrderTargets.map((s) => <option key={s} value={s}>{to(s)}</option>)}
              </Select>
              <Input name="note" placeholder={t("note")} aria-label={t("note")} maxLength={1000} />
              <SubmitButton variant="secondary">{t("apply")}</SubmitButton>
              <p className="text-xs text-muted sm:col-span-3">{t("statusHelp")}</p>
            </form>
          )}
        </Card>
      </div>

      <Card id="payment" className="flex flex-col gap-3">
        <h2 className="font-bold">{t("paymentTitle")}</h2>
        {order.ap_payments.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {order.ap_payments.map((p) => (
              <li key={p.id}>
                <span className="font-bold ltr-value">{formatMoney(p.amount, p.currency, locale)}</span> · {t(`method_${p.method}`)} ·{" "}
                <span className="ltr-value">{p.reference}</span> · {p.received_by}
                <span className="ms-2 text-xs text-muted">{dateFmt.format(new Date(p.recorded_at))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t("noPayment")}</p>
        )}
        {can("finance.manage") && order.status === "awaiting_payment" && order.payment_status === "unpaid" && (
          <form action={recordPayment} className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
            {hidden}
            <input type="hidden" name="currency" value={order.currency} />
            <Alert tone="info">{t("paymentHelp")}</Alert>
            <span />
            <Field label={t("amount")} htmlFor="amount">
              <Input id="amount" name="amount" required inputMode="decimal" dir="ltr" defaultValue={order.total} />
            </Field>
            <Field label={t("method")} htmlFor="method">
              <Select id="method" name="method">{paymentMethods.map((m) => <option key={m} value={m}>{t(`method_${m}`)}</option>)}</Select>
            </Field>
            <Field label={t("paymentReference")} htmlFor="reference">
              <Input id="reference" name="reference" required minLength={2} maxLength={120} dir="ltr" />
            </Field>
            <Field label={t("receivedBy")} htmlFor="receivedBy">
              <Input id="receivedBy" name="receivedBy" required minLength={2} maxLength={200} />
            </Field>
            <div className="sm:col-span-2"><Field label={t("note")} htmlFor="paymentNote"><Textarea id="paymentNote" name="note" maxLength={1000} /></Field></div>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="confirm" required className="mt-1 size-4 accent-accent" />
              <span>{t("paymentConfirm")}</span>
            </label>
            <div><SubmitButton>{t("recordPayment")}</SubmitButton></div>
          </form>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-bold">{tsh("shipmentsTitle")}</h2>
        {shipments.length === 0 && <p className="text-sm text-muted">{tsh("noShipments")}</p>}
        {shipments.map((s) => (
          <div key={s.id} className="rounded-lg border border-line p-3">
            <ShipmentPanel shipment={{ ...s, carrier_label: s.carrier_id ? orgName.get(s.carrier_id) : null }} locale={locale}
              manage={can("shipping.manage")} isAdmin back={`/admin/orders/${order.id}`} showRecipient />
          </div>
        ))}
        {can("shipping.manage") && !canShip && !active && <p className="text-sm text-muted">{tsh("notReady")}</p>}
        {canShip && (
          <form action={createShipment} className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
            {hidden}
            {shippingQuote && <input type="hidden" name="shippingQuoteId" value={shippingQuote.id} />}
            <h3 className="font-bold sm:col-span-2">{tsh("createShipment")}</h3>
            {shippingQuote && (
              <p className="text-sm text-muted sm:col-span-2">
                {tsh("fromShippingQuote")}: {shippingQuote.carrier_id ? orgName.get(shippingQuote.carrier_id) : shippingQuote.carrier_name} · {tm(shippingQuote.mode)}
              </p>
            )}
            <Field label={tsh("carrier")} htmlFor="carrierId">
              <Select id="carrierId" name="carrierId" defaultValue={shippingQuote?.carrier_id ?? ""}>
                <option value="">{tsh("externalCarrier")}</option>
                {carriers.map((c) => <option key={c.id} value={c.id}>{c.trade_name || c.legal_name}</option>)}
              </Select>
            </Field>
            <Field label={tsh("carrierName")} hint={tsh("carrierNameHint")} htmlFor="carrierName">
              <Input id="carrierName" name="carrierName" maxLength={120} defaultValue={shippingQuote?.carrier_name ?? ""} />
            </Field>
            <Field label={tsh("mode")} htmlFor="mode">
              <Select id="mode" name="mode" defaultValue={shippingQuote?.mode ?? "air"}>{shippingModes.map((m) => <option key={m} value={m}>{tm(m)}</option>)}</Select>
            </Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label={tsh("piecesLabel")} htmlFor="pieces"><Input id="pieces" name="pieces" type="number" min={1} defaultValue={shippingQuote?.pieces ?? 1} /></Field>
              <Field label={tsh("weightKg")} htmlFor="weightKg"><Input id="weightKg" name="weightKg" inputMode="decimal" dir="ltr" defaultValue={shippingQuote?.weight_kg ?? ""} /></Field>
              <Field label={tsh("volumetricKg")} htmlFor="volumetricKg"><Input id="volumetricKg" name="volumetricKg" inputMode="decimal" dir="ltr" defaultValue={shippingQuote?.volumetric_weight_kg ?? ""} /></Field>
            </div>
            <Field label={tsh("recipientName")} htmlFor="recipientName"><Input id="recipientName" name="recipientName" required defaultValue={req?.contact_name ?? ""} maxLength={120} /></Field>
            <Field label={tsh("recipientPhone")} htmlFor="recipientPhone"><Input id="recipientPhone" name="recipientPhone" required type="tel" dir="ltr" defaultValue={req?.contact_phone ?? ""} /></Field>
            <Field label={tq("city")} htmlFor="city"><Input id="city" name="city" required defaultValue={req?.city ?? ""} maxLength={80} /></Field>
            <Field label={tsh("etaDays")} htmlFor="days"><Input id="days" name="days" type="number" min={1} max={365} defaultValue={shippingQuote?.delivery_estimate_days ?? ""} /></Field>
            <div className="sm:col-span-2"><Field label={tsh("address")} hint={tsh("addressHint")} htmlFor="address"><Textarea id="address" name="address" required minLength={5} maxLength={500} /></Field></div>
            <div><SubmitButton>{tsh("assign")}</SubmitButton></div>
          </form>
        )}
      </Card>
    </div>
  );
}
