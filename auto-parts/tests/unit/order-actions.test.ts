import { beforeEach, describe, expect, it, vi } from "vitest";

// إجراءات الخادم في مسار الطلب: الطلب ← عرض المورد ← التسعيرة ← الموافقة ← بلاغ التحويل والإعدادات.
// قاعدة البيانات هي الحماية الفعلية (supabase/tests)؛ هنا نتأكد أن كل إجراء يرفض المدخلات الخاطئة قبل القاعدة،
// ويستدعي الدالة الصحيحة بالقيم المطبّعة، ويعيد المستخدم للصفحة الصحيحة برمز الخطأ المترجم.

class Redirect extends Error {
  constructor(public url: string) { super(url); }
}

const state: {
  session: { userId: string; fullName: string; permissions: Set<string> } | null;
  rpc: { data: unknown; error: { message: string } | null };
  calls: { name: string; args: Record<string, unknown> }[];
} = { session: null, rpc: { data: null, error: null }, calls: [] };

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Redirect(url); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/site-data", () => ({ SETTINGS_TAG: "public-settings" }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (name: string, args: Record<string, unknown>) => { state.calls.push({ name, args }); return state.rpc; },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: async () => ({ error: null }) }) },
  }),
}));
vi.mock("@/lib/auth", () => {
  const localePath = (locale: string, path: string) => (locale === "ar" ? path : `/${locale}${path === "/" ? "" : path}`);
  const requireSession = async (locale: string, next: string) => {
    if (!state.session) throw new Redirect(`${localePath(locale, "/login")}?next=${encodeURIComponent(next)}`);
    return state.session;
  };
  const requireStaff = async (locale: string, next: string, permission?: string) => {
    const s = await requireSession(locale, next);
    if (permission && !s.permissions.has(permission)) throw new Redirect(localePath(locale, "/forbidden"));
    return s;
  };
  return { localePath, requireSession, requireStaff };
});

const { createQuoteRequest, acceptCustomerQuote, submitSupplierQuote, issueCustomerQuote, sendToSuppliers } = await import("@/server/quote-actions");
const { reportPayment, updateSetting, recordPayment, confirmDelivery } = await import("@/server/shipping-actions");

const REQ = "11111111-1111-4111-8111-111111111111";
const QUOTE = "22222222-2222-4222-8222-222222222222";
const ORG = "33333333-3333-4333-8333-333333333333";
const ORDER = "44444444-4444-4444-8444-444444444444";

function form(values: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
}

async function run(action: (f: FormData) => Promise<unknown>, values: Record<string, string | string[]>): Promise<string> {
  try {
    await action(form(values));
  } catch (e) {
    if (e instanceof Redirect) return e.url;
    throw e;
  }
  throw new Error("action did not redirect");
}

const customer = { userId: "u-customer", fullName: "عميل", permissions: new Set<string>() };
const staff = (...perms: string[]) => ({ userId: "u-staff", fullName: "موظف", permissions: new Set(perms) });

beforeEach(() => {
  state.session = customer;
  state.rpc = { data: null, error: null };
  state.calls = [];
});

describe("createQuoteRequest", () => {
  const valid = {
    locale: "ar", description: "صدام أمامي", city: "الرياض", contactPhone: "0501234567", privacy: "on",
    vin: "lvvdb11b0nd123456", quantity: "2", brandId: "not-a-uuid",
  };

  it("sends visitors to login and back to the form", async () => {
    state.session = null;
    expect(await run(createQuoteRequest, { ...valid, locale: "en" })).toBe("/en/login?next=%2Frequest-part");
    expect(state.calls).toHaveLength(0);
  });

  it("rejects a bad VIN, phone, missing consent or too-short fields before touching the database", async () => {
    expect(await run(createQuoteRequest, { ...valid, vin: "SHORT" })).toBe("/request-part?error=vin");
    expect(await run(createQuoteRequest, { ...valid, contactPhone: "123" })).toBe("/request-part?error=phone");
    expect(await run(createQuoteRequest, { ...valid, privacy: "" })).toBe("/request-part?error=privacy");
    expect(await run(createQuoteRequest, { ...valid, city: "x" })).toBe("/request-part?error=invalid");
    expect(state.calls).toHaveLength(0);
  });

  it("normalizes VIN and phone, drops invalid ids, and opens the new request", async () => {
    state.rpc = { data: REQ, error: null };
    expect(await run(createQuoteRequest, valid)).toBe(`/account/requests/${REQ}?created=1`);
    expect(state.calls[0].name).toBe("ap_create_quote_request");
    expect(state.calls[0].args).toMatchObject({
      p_vin: "LVVDB11B0ND123456", p_contact_phone: "+966501234567", p_quantity: 2, p_brand: null,
      p_contact_name: "عميل", p_privacy_accepted: true,
    });
  });

  it("turns a database error into a translatable code", async () => {
    state.rpc = { data: null, error: { message: "ap: rate limited" } };
    expect(await run(createQuoteRequest, valid)).toBe("/request-part?error=rate_limited");
  });
});

describe("acceptCustomerQuote", () => {
  it("requires the customer to tick the agreement", async () => {
    expect(await run(acceptCustomerQuote, { locale: "ar", requestId: REQ, quoteId: QUOTE })).toBe(`/account/requests/${REQ}?error=agree`);
    expect(state.calls).toHaveLength(0);
  });

  it("creates the order and lands on the orders page", async () => {
    state.rpc = { data: ORDER, error: null };
    expect(await run(acceptCustomerQuote, { locale: "zh", requestId: REQ, quoteId: QUOTE, agree: "on" })).toBe(`/zh/account/orders?created=${ORDER}`);
    expect(state.calls[0]).toEqual({ name: "ap_accept_customer_quote", args: { p_quote: QUOTE } });
  });

  it("shows why an expired quote was refused", async () => {
    state.rpc = { data: null, error: { message: "ap: quote expired" } };
    expect(await run(acceptCustomerQuote, { locale: "ar", requestId: REQ, quoteId: QUOTE, agree: "on" })).toBe(`/account/requests/${REQ}?error=quote_expired`);
  });
});

describe("submitSupplierQuote", () => {
  const valid = {
    locale: "ar", requestId: REQ, organizationId: ORG, partType: "genuine", currency: "CNY", unitPrice: "120.50", validUntil: "2030-01-31",
  };

  it("rejects zero, negative or malformed prices and unknown currencies", async () => {
    for (const bad of [{ unitPrice: "0" }, { unitPrice: "-5" }, { unitPrice: "12.345" }, { currency: "XXX" }, { partType: "fake" }]) {
      expect(await run(submitSupplierQuote, { ...valid, ...bad })).toBe(`/partner/requests/${REQ}?error=invalid`);
    }
    expect(state.calls).toHaveLength(0);
  });

  it("sends the price as a number with the offer expiring at the end of the Riyadh day", async () => {
    expect(await run(submitSupplierQuote, valid)).toBe(`/partner/requests/${REQ}?saved=1`);
    expect(state.calls[0].args).toMatchObject({ p_request: REQ, p_org: ORG, p_unit_price: 120.5, p_currency: "CNY", p_part_type: "genuine", p_valid_until: "2030-01-31T23:59:59+03:00" });
  });
});

describe("admin quote actions", () => {
  it("are forbidden without quotes.manage", async () => {
    state.session = staff("finance.manage");
    expect(await run(issueCustomerQuote, { locale: "ar", requestId: REQ, quoteId: QUOTE, validUntil: "2030-01-31" })).toBe("/forbidden");
    expect(state.calls).toHaveLength(0);
  });

  it("refuses to send a request to nobody and caps the supplier list", async () => {
    state.session = staff("quotes.manage");
    expect(await run(sendToSuppliers, { locale: "ar", requestId: REQ, orgs: ["junk"] })).toBe(`/admin/quotes/${REQ}?error=noSuppliers#suppliers`);
    const many = Array.from({ length: 40 }, (_, i) => `33333333-3333-4333-8333-${String(i).padStart(12, "0")}`);
    await run(sendToSuppliers, { locale: "ar", requestId: REQ, orgs: many, shareVin: "on" });
    expect((state.calls[0].args.p_orgs as string[]).length).toBe(30);
    expect(state.calls[0].args).toMatchObject({ p_share_vin: true, p_share_media: false });
  });
});

describe("reportPayment", () => {
  it("rejects a missing or too-short transfer reference", async () => {
    expect(await run(reportPayment, { locale: "ar", orderId: ORDER, reference: " 1 " })).toBe("/account/orders?error=invalid_reference");
    expect(await run(reportPayment, { locale: "ar", orderId: "x", reference: "TRX-1" })).toBe("/account/orders");
    expect(state.calls).toHaveLength(0);
  });

  it("reports the trimmed reference and confirms", async () => {
    expect(await run(reportPayment, { locale: "en", orderId: ORDER, reference: "  TRX-998877 " })).toBe("/en/account/orders?reported=1");
    expect(state.calls[0]).toEqual({ name: "ap_customer_report_payment", args: { p_order: ORDER, p_reference: "TRX-998877" } });
  });

  it("explains when the order is already paid", async () => {
    state.rpc = { data: null, error: { message: "ap: order not awaiting payment" } };
    expect(await run(reportPayment, { locale: "ar", orderId: ORDER, reference: "TRX-1" })).toBe("/account/orders?error=order_not_awaiting_payment");
  });
});

describe("recordPayment and confirmDelivery", () => {
  it("only finance records payments", async () => {
    state.session = staff("orders.manage_all");
    const url = await run(recordPayment, { locale: "ar", orderId: ORDER, amount: "570", currency: "SAR", method: "bank_transfer", reference: "TRX-1", receivedBy: "المورد", confirm: "on" });
    expect(url).toBe("/forbidden");
    expect(state.calls).toHaveLength(0);
  });

  it("customers confirm delivery of their own order through the database check", async () => {
    expect(await run(confirmDelivery, { locale: "ar", orderId: ORDER })).toBe("/account/orders?confirmed=1");
    expect(state.calls[0]).toEqual({ name: "ap_customer_confirm_delivery", args: { p_order: ORDER } });
  });
});

describe("updateSetting (bank details)", () => {
  it("stores the IBAN without spaces and in upper case", async () => {
    state.session = staff("settings.edit");
    expect(await run(updateSetting, { locale: "ar", key: "bank_iban", value: "sa03 8000 0000 6080 1016 7519" })).toBe("/admin/settings?saved=1");
    expect(state.calls[0]).toEqual({ name: "ap_admin_update_setting", args: { p_key: "bank_iban", p_value: "SA0380000000608010167519" } });
  });

  it("rejects a non-Saudi or short IBAN and unknown keys", async () => {
    state.session = staff("settings.edit");
    expect(await run(updateSetting, { locale: "ar", key: "bank_iban", value: "GB29NWBK60161331926819" })).toBe("/admin/settings?error=invalid&key=bank_iban");
    expect(await run(updateSetting, { locale: "ar", key: "push_webhook_url", value: "https://evil.example" })).toBe("/admin/settings?error=invalid&key=push_webhook_url");
    expect(state.calls).toHaveLength(0);
  });
});
