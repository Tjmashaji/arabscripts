import { getTranslations } from "next-intl/server";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Input, Select, statusTone } from "@/components/ui";
import { chargeableWeight, nextShipmentStatuses, shipmentDocKinds, type ShipmentStatus } from "@/lib/shipping";
import { updateShipment, uploadShipmentDocument } from "@/server/shipping-actions";

export type ShipmentRow = {
  id: string; reference: string; status: ShipmentStatus; carrier_name: string | null; carrier_label?: string | null; mode: string;
  tracking_number: string | null; pieces: number; weight_kg: string | null; volumetric_weight_kg: string | null;
  recipient_name?: string; recipient_phone?: string; destination_city: string; destination_address?: string;
  estimated_delivery_at: string | null; delivered_at: string | null;
  ap_shipment_events: { id: number; status: string; location: string | null; note: string | null; source: string; occurred_at: string }[];
  ap_shipment_documents: { id: string; kind: string; file_name: string; created_at: string }[];
};

// تفاصيل الشحنة وخط زمني لأحداثها ومستنداتها. نماذج التحديث تظهر للناقل المسند ولإدارة الشحن فقط
// (والتحقق الفعلي في قاعدة البيانات).
export async function ShipmentPanel({ shipment, locale, manage, isAdmin = false, back, showRecipient = false }: {
  shipment: ShipmentRow; locale: string; manage: boolean; isAdmin?: boolean; back: string; showRecipient?: boolean;
}) {
  const t = await getTranslations("shipping");
  const ts = await getTranslations("shipmentStatus");
  const tm = await getTranslations("shippingModes");
  const td = await getTranslations("shipmentDocs");
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });
  const next = nextShipmentStatuses(shipment.status, isAdmin);
  const events = [...shipment.ap_shipment_events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const weight = chargeableWeight(shipment.weight_kg, shipment.volumetric_weight_kg);
  const hidden = (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="shipmentId" value={shipment.id} />
      <input type="hidden" name="back" value={back} />
    </>
  );

  return (
    <div id="shipment" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold"><span className="ltr-value">{shipment.reference}</span> · {shipment.carrier_label ?? shipment.carrier_name ?? "—"}</h3>
        <Badge tone={shipment.status === "delivered" ? "success" : statusTone(shipment.status === "failed" || shipment.status === "returned" ? "rejected" : "opened")}>
          {ts(shipment.status)}
        </Badge>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-muted">{t("tracking")}</dt><dd className="ltr-value font-bold">{shipment.tracking_number ?? "—"}</dd></div>
        <div><dt className="text-xs text-muted">{t("mode")}</dt><dd>{tm(shipment.mode)}</dd></div>
        <div><dt className="text-xs text-muted">{t("weight")}</dt><dd>{weight != null ? t("kg", { value: weight }) : "—"} · {t("pieces", { count: shipment.pieces })}</dd></div>
        <div><dt className="text-xs text-muted">{t("destination")}</dt><dd>{shipment.destination_city}</dd></div>
        <div><dt className="text-xs text-muted">{t("eta")}</dt><dd>{shipment.estimated_delivery_at ? dateFmt.format(new Date(shipment.estimated_delivery_at)) : "—"}</dd></div>
        {shipment.delivered_at && <div><dt className="text-xs text-muted">{t("deliveredAt")}</dt><dd>{dateFmt.format(new Date(shipment.delivered_at))}</dd></div>}
        {showRecipient && shipment.recipient_name && (
          <div className="sm:col-span-3">
            <dt className="text-xs text-muted">{t("recipient")}</dt>
            <dd>{shipment.recipient_name} · <span className="ltr-value">{shipment.recipient_phone}</span> — {shipment.destination_address}</dd>
          </div>
        )}
      </dl>

      <ol className="flex flex-col gap-2 border-s-2 border-line ps-4 text-sm">
        {events.map((e) => (
          <li key={e.id}>
            <span className="font-bold">{ts(e.status)}</span>
            {e.location && <> · {e.location}</>}
            <span className="ms-2 text-xs text-muted">{dateFmt.format(new Date(e.occurred_at))}</span>
            {e.note && <p className="text-xs text-muted">{e.note}</p>}
          </li>
        ))}
      </ol>

      <div id="documents" className="flex flex-col gap-2">
        {shipment.ap_shipment_documents.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {shipment.ap_shipment_documents.map((d) => (
              <li key={d.id}>
                <a href={`/api/shipment-documents/${d.id}`} target="_blank" rel="noopener" className="rounded-lg border border-line px-3 py-1 text-sm text-accent">
                  {td(d.kind)} · {d.file_name}
                </a>
              </li>
            ))}
          </ul>
        )}
        {manage && !["cancelled", "returned"].includes(shipment.status) && (
          <form action={uploadShipmentDocument} className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
            {hidden}
            <Select name="kind" aria-label={t("docKind")} defaultValue="proof_of_delivery">
              {shipmentDocKinds.map((k) => <option key={k} value={k}>{td(k)}</option>)}
            </Select>
            <Input type="file" name="file" required accept="application/pdf,image/jpeg,image/png" aria-label={t("file")} className="py-2" />
            <SubmitButton variant="secondary">{t("upload")}</SubmitButton>
          </form>
        )}
      </div>

      {manage && next.length > 0 && (
        <form action={updateShipment} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
          {hidden}
          <Select name="status" aria-label={t("newStatus")} defaultValue={next.find((s) => s !== "in_transit" || shipment.status !== "customs_clearance") ?? next[0]}>
            {next.map((s) => <option key={s} value={s}>{ts(s)}</option>)}
          </Select>
          <Input name="tracking" placeholder={t("tracking")} aria-label={t("tracking")} defaultValue={shipment.tracking_number ?? ""} dir="ltr" maxLength={80} />
          <Input name="location" placeholder={t("location")} aria-label={t("location")} maxLength={120} />
          <Input name="note" placeholder={t("note")} aria-label={t("note")} maxLength={1000} />
          <p className="text-xs text-muted sm:col-span-2">{t("updateHelp")}</p>
          <div><SubmitButton>{t("update")}</SubmitButton></div>
        </form>
      )}
    </div>
  );
}
