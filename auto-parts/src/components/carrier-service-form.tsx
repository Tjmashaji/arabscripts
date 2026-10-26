import { getTranslations } from "next-intl/server";
import { SubmitButton } from "./submit-button";
import { Field, Input, Select } from "./ui";
import { currencies } from "@/lib/catalog";
import { shippingModes } from "@/lib/shipping";
import { saveCarrierService } from "@/server/shipping-actions";

export type CarrierService = {
  id: string; organization_id: string; name: string; mode: string; origin_countries: string[]; destination_countries: string[];
  transit_days_min: number | null; transit_days_max: number | null; notes: string | null; enabled: boolean;
  price_per_kg: string | null; price_currency: string | null; min_charge: string | null; pickup_location: string | null;
};

// خدمة شحن واحدة: النوع والمسار وموقع الاستلام والتكلفة والمدة. تُستخدم في لوحة الناقل وفي طلب الاعتماد.
// back: الصفحة التي يعود إليها بعد الحفظ.
export async function CarrierServiceForm({ locale, orgs, service, back }: {
  locale: string; orgs: { id: string; name: string }[]; service?: CarrierService; back: "carrier" | "application";
}) {
  const t = await getTranslations("carrier");
  const tm = await getTranslations("shippingModes");
  const tsh = await getTranslations("shipping");
  const s = service;
  const idp = s ? `svc-${s.id.slice(0, 8)}-` : "svc-new-";
  return (
    <form action={saveCarrierService} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="back" value={back} />
      {s && <input type="hidden" name="serviceId" value={s.id} />}
      {orgs.length === 1 || s ? (
        <input type="hidden" name="organizationId" value={s?.organization_id ?? orgs[0].id} />
      ) : (
        <Select name="organizationId" aria-label={t("organization")} className="sm:col-span-2">
          {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      )}
      <Field label={t("serviceName")} htmlFor={`${idp}name`}>
        <Input id={`${idp}name`} name="name" required minLength={2} maxLength={120} placeholder={t("serviceNameHint")} defaultValue={s?.name ?? ""} />
      </Field>
      <Field label={tsh("mode")} htmlFor={`${idp}mode`}>
        <Select id={`${idp}mode`} name="mode" defaultValue={s?.mode ?? "air"}>{shippingModes.map((m) => <option key={m} value={m}>{tm(m)}</option>)}</Select>
      </Field>
      <Field label={t("pickupLocation")} htmlFor={`${idp}pickup`}>
        <Input id={`${idp}pickup`} name="pickupLocation" maxLength={200} placeholder={t("pickupHint")} defaultValue={s?.pickup_location ?? ""} />
      </Field>
      <Field label={t("origins")} hint={t("countriesHint")} htmlFor={`${idp}origins`}>
        <Input id={`${idp}origins`} name="origins" required dir="ltr" defaultValue={s?.origin_countries.join(", ") ?? "CN"} />
      </Field>
      <Field label={t("destinations")} hint={t("countriesHint")} htmlFor={`${idp}destinations`}>
        <Input id={`${idp}destinations`} name="destinations" required dir="ltr" defaultValue={s?.destination_countries.join(", ") ?? "SA"} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("pricePerKg")} htmlFor={`${idp}price`}>
          <Input id={`${idp}price`} name="pricePerKg" inputMode="decimal" dir="ltr" required={back === "application"} defaultValue={s?.price_per_kg ?? ""} />
        </Field>
        <Field label={t("currency")} htmlFor={`${idp}currency`}>
          <Select id={`${idp}currency`} name="priceCurrency" defaultValue={s?.price_currency ?? "CNY"}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t("minCharge")} htmlFor={`${idp}min`}>
        <Input id={`${idp}min`} name="minCharge" inputMode="decimal" dir="ltr" defaultValue={s?.min_charge ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("daysMin")} htmlFor={`${idp}dmin`}>
          <Input id={`${idp}dmin`} name="daysMin" type="number" min={0} max={365} defaultValue={s?.transit_days_min ?? ""} />
        </Field>
        <Field label={t("daysMax")} htmlFor={`${idp}dmax`}>
          <Input id={`${idp}dmax`} name="daysMax" type="number" min={0} max={365} defaultValue={s?.transit_days_max ?? ""} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label={tsh("note")} htmlFor={`${idp}notes`}>
          <Input id={`${idp}notes`} name="notes" maxLength={1000} placeholder={t("notesHint")} defaultValue={s?.notes ?? ""} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={s?.enabled ?? true} className="size-4 accent-accent" /> {t("enabled")}
      </label>
      <div><SubmitButton variant="secondary">{tsh("save")}</SubmitButton></div>
    </form>
  );
}
