import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SiteShell } from "@/components/site-shell";
import { ShipmentPanel, type ShipmentRow } from "@/components/shipment-panel";
import { Alert, Card, PageTitle } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { SHIPMENT_SELECT } from "@/lib/shipping";
import { errorMessage } from "@/lib/errors";
import { localeFrom } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const locale = await localeFrom(params);
  return { title: (await getTranslations({ locale, namespace: "carrier" }))("shipments") };
}

// شحنة مسندة للناقل: بيانات التسليم اللازمة فقط، وتحديث المراحل ورقم التتبع، ورفع إثبات التسليم والفواتير.
export default async function CarrierShipment({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const locale = await localeFrom(params);
  setRequestLocale(locale);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const q = await searchParams;
  const t = await getTranslations("carrier");
  const tsh = await getTranslations("shipping");
  const supabase = await createClient();
  const { data } = await supabase.from("ap_shipments").select(SHIPMENT_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const shipment = data as unknown as ShipmentRow;

  return (
    <SiteShell locale={locale} path={`/carrier/shipments/${id}`}>
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-10">
        <Link href="/carrier" className="text-sm text-accent">← {t("title")}</Link>
        <PageTitle>{t("shipments")}</PageTitle>
        {q.saved && <Alert tone="success">{tsh("saved")}</Alert>}
        {q.error && <Alert tone="danger">{await errorMessage(q.error)}</Alert>}
        <Card>
          <ShipmentPanel shipment={shipment} locale={locale} manage back={`/carrier/shipments/${id}`} showRecipient />
        </Card>
        <p className="text-xs text-muted">{t("podNote")}</p>
      </div>
    </SiteShell>
  );
}
