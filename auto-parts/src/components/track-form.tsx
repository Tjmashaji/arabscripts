"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { trackOrder, type TrackResult } from "@/server/track-actions";
import { Alert, Badge, Card, Field, Input } from "./ui";
import { SubmitButton } from "./submit-button";

// نموذج التتبع والنتيجة في نفس الصفحة: لا يظهر رقم الجوال في الرابط ولا في سجل المتصفح.
export function TrackForm() {
  const t = useTranslations("track");
  const to = useTranslations("orderStatus");
  const ts = useTranslations("shipmentStatus");
  const locale = useLocale();
  const [result, action] = useActionState<TrackResult, FormData>(trackOrder, { state: "idle" });
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <form action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t("reference")} htmlFor="reference">
            <Input id="reference" name="reference" required dir="ltr" defaultValue={result.input?.reference} placeholder="ORD-100001" autoCapitalize="characters" spellCheck={false} />
          </Field>
          <Field label={t("phone")} htmlFor="phone">
            <Input id="phone" name="phone" type="tel" required dir="ltr" defaultValue={result.input?.phone} placeholder="05XXXXXXXX" autoComplete="tel" />
          </Field>
          <SubmitButton>{t("submit")}</SubmitButton>
        </form>
        <p className="mt-3 text-xs text-muted">{t("help")}</p>
      </Card>
      {result.state === "error" && <Alert tone="danger">{t(`error_${result.code}`)}</Alert>}
      {result.state === "found" && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold ltr-value">{result.reference}</h2>
            <Badge tone="info">{to(result.status)}</Badge>
          </div>
          {!result.shipment ? (
            <p className="text-sm text-muted">{t("noShipment")}</p>
          ) : (
            <>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-xs text-muted">{t("carrier")}</dt><dd>{result.shipment.carrier ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted">{t("tracking")}</dt><dd className="ltr-value font-bold">{result.shipment.tracking_number ?? "—"}</dd></div>
                <div><dt className="text-xs text-muted">{result.shipment.delivered_at ? t("deliveredAt") : t("eta")}</dt>
                  <dd>{(result.shipment.delivered_at ?? result.shipment.estimated_delivery_at)
                    ? dateFmt.format(new Date((result.shipment.delivered_at ?? result.shipment.estimated_delivery_at)!)) : "—"}</dd></div>
              </dl>
              <ol className="flex flex-col gap-2 border-s-2 border-line ps-4 text-sm">
                {result.shipment.events.map((e, i) => (
                  <li key={i}>
                    <span className="font-bold">{ts(e.status)}</span>{e.location && <> · {e.location}</>}
                    <span className="ms-2 text-xs text-muted">{dateFmt.format(new Date(e.occurred_at))}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
