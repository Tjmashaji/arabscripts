import { z } from "zod";

// مساعد التعبئة الذكي: لكل نموذج قائمة الحقول التي يحق للمساعد تعبئتها ووصف كل حقل للنموذج اللغوي.
// أسماء الحقول هي نفس name في نماذج الصفحات. حقول select تأخذ خياراتها من الصفحة نفسها (ما يراه المستخدم).
export type AiFieldKind = "text" | "long" | "number" | "select";
export type AiField = { name: string; kind: AiFieldKind; hint: string };

const COUNTRY = "ISO 3166-1 alpha-2 country code";
export const aiProfiles = {
  partner_application: [
    { name: "account_kind", kind: "select", hint: "individual = a person working alone (broker, freelancer); company = a registered company, factory or establishment" },
    { name: "legal_name", kind: "text", hint: "registered legal name of the company exactly as written in the document, or the person's full name for an individual" },
    { name: "trade_name", kind: "text", hint: "trade / brand name if different from the legal name" },
    { name: "registration_number", kind: "text", hint: "commercial registration / business license / unified social credit code number" },
    { name: "vat_number", kind: "text", hint: "VAT or tax registration number" },
    { name: "entity_type", kind: "text", hint: "legal form, e.g. limited liability company, sole proprietorship" },
    { name: "country_code", kind: "select", hint: `country of registration (${COUNTRY})` },
    { name: "city", kind: "text", hint: "city" },
    { name: "operating_country", kind: "select", hint: `main country of operation (${COUNTRY})` },
    { name: "billing_currency", kind: "text", hint: "ISO 4217 currency code used for invoices, e.g. CNY, USD, SAR" },
    { name: "website", kind: "text", hint: "website URL starting with https://" },
    { name: "registered_address", kind: "long", hint: "full registered address as written in the source" },
    { name: "activity_description", kind: "long", hint: "short description of the business activity and the parts or services offered" },
    { name: "contact_name", kind: "text", hint: "name of the contact person" },
    { name: "contact_title", kind: "text", hint: "job title of the contact person" },
    { name: "contact_phone", kind: "text", hint: "phone in international format, e.g. +8613800000000" },
    { name: "contact_email", kind: "text", hint: "email address" },
  ],
  bank: [
    { name: "bankName", kind: "text", hint: "bank name" },
    { name: "holder", kind: "text", hint: "account holder name exactly as in the bank document" },
    { name: "iban", kind: "text", hint: "IBAN without spaces, only if an IBAN is shown" },
    { name: "accountNumber", kind: "text", hint: "account number when there is no IBAN (e.g. Chinese bank accounts)" },
    { name: "swift", kind: "text", hint: "SWIFT / BIC code" },
    { name: "currency", kind: "select", hint: "account currency" },
  ],
  carrier_service: [
    { name: "name", kind: "text", hint: "short service name, e.g. Air express Guangzhou to Riyadh" },
    { name: "mode", kind: "select", hint: "shipping mode" },
    { name: "pickupLocation", kind: "text", hint: "where the carrier receives the goods (city, warehouse or port)" },
    { name: "origins", kind: "text", hint: "origin countries as comma-separated ISO alpha-2 codes, e.g. CN" },
    { name: "destinations", kind: "text", hint: "destination countries as comma-separated ISO alpha-2 codes, e.g. SA, AE" },
    { name: "pricePerKg", kind: "number", hint: "price per kilogram as a plain decimal number" },
    { name: "priceCurrency", kind: "select", hint: "currency of the price" },
    { name: "minCharge", kind: "number", hint: "minimum charge per shipment as a plain decimal number" },
    { name: "daysMin", kind: "number", hint: "minimum transit time in days (whole number)" },
    { name: "daysMax", kind: "number", hint: "maximum transit time in days (whole number)" },
    { name: "notes", kind: "long", hint: "other conditions: volumetric weight rule, restricted goods, insurance, customs" },
  ],
  product: [
    { name: "name", kind: "text", hint: "product name: part name plus the car model, e.g. Front brake pads Geely Coolray" },
    { name: "brandId", kind: "select", hint: "car brand" },
    { name: "categoryId", kind: "select", hint: "part category" },
    { name: "description", kind: "long", hint: "description: OEM / part numbers, fitment (models and years), material, condition, package contents" },
    { name: "language", kind: "select", hint: "language the name and description are written in" },
  ],
} as const satisfies Record<string, readonly AiField[]>;

export type AiProfile = keyof typeof aiProfiles;
export const isAiProfile = (v: unknown): v is AiProfile => typeof v === "string" && Object.hasOwn(aiProfiles, v);

export const AI_MAX_TEXT = 8000;
export const AI_MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_OPTIONS = 300;

export type AiOption = { value: string; label: string };

// خيارات القوائم كما أرسلتها الصفحة: تُنظَّف وتُقص حتى لا تتحول إلى باب لإرسال نص كبير أو قيم غريبة.
export function cleanOptions(profile: AiProfile, raw: unknown): Record<string, AiOption[]> {
  const out: Record<string, AiOption[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const f of aiProfiles[profile] as readonly AiField[]) {
    if (f.kind !== "select") continue;
    const list = (raw as Record<string, unknown>)[f.name];
    if (!Array.isArray(list)) continue;
    const seen = new Set<string>();
    const opts: AiOption[] = [];
    for (const o of list.slice(0, MAX_OPTIONS)) {
      const value = typeof o?.value === "string" ? o.value : "";
      const label = typeof o?.label === "string" ? o.label.replace(/\s+/g, " ").trim().slice(0, 80) : "";
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(value) || seen.has(value)) continue;
      seen.add(value);
      opts.push({ value, label: label || value });
    }
    if (opts.length) out[f.name] = opts;
  }
  return out;
}

// مخطط الإجابة: كل حقل نص أو null (لا تخمين). قيم القوائم تُطابق بخياراتها الفعلية في cleanValues.
export function outputSchema(profile: AiProfile, options: Record<string, AiOption[]>) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of aiProfiles[profile] as readonly AiField[]) {
    if (f.kind === "select" && !options[f.name]?.length) continue;
    shape[f.name] = z.string().nullable();
  }
  return z.object({ values: z.object(shape), note: z.string().nullable() });
}

// وصف الحقول للنموذج: الاسم والمعنى، ومع القوائم خياراتها بأسمائها الظاهرة.
export function describeFields(profile: AiProfile, options: Record<string, AiOption[]>): string {
  return (aiProfiles[profile] as readonly AiField[])
    .filter((f) => f.kind !== "select" || options[f.name]?.length)
    .map((f) => {
      const line = `- ${f.name} (${f.kind}): ${f.hint}`;
      if (f.kind !== "select") return line;
      return `${line}. Allowed values: ${options[f.name].map((o) => `${o.value} = ${o.label}`).join("; ")}`;
    })
    .join("\n");
}

// الناتج النهائي: نصوص مقصوصة، والأرقام أرقام فعلًا، وقيم القوائم من خياراتها فقط، والقيم الفارغة تُحذف.
export function cleanValues(profile: AiProfile, values: Record<string, unknown>, options: Record<string, AiOption[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of aiProfiles[profile] as readonly AiField[]) {
    const v = values[f.name];
    if (typeof v !== "string") continue;
    let s = v.trim();
    if (f.kind === "select" && !options[f.name]?.some((o) => o.value === s)) continue;
    if (f.kind === "number") {
      s = s.replace(/[,\s]/g, "");
      if (!/^\d+(\.\d+)?$/.test(s)) continue;
    }
    s = s.slice(0, f.kind === "long" ? 2000 : 300);
    if (s) out[f.name] = s;
  }
  return out;
}
