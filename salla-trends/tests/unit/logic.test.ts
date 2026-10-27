import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fingerprint, normalizeText, tokens, validGtin } from "@/lib/normalize";
import { countryCode, regionFor } from "@/lib/regions";
import { classify } from "@/lib/taxonomy";
import { normalizeVerificationNumber, sniffDocument, safeFileName } from "@/lib/verification";
import { decrypt, encrypt, verifySallaSignature } from "@/server/crypto";
import { tokenSetFrom } from "@/server/salla/client";
import { parseEnvelope, parseOrder, parseProduct, parseSallaDate } from "@/server/salla/parse";

describe("توحيد الأسماء والبصمة", () => {
  it("يوحد الهمزات والتاء المربوطة والتشكيل والأرقام العربية", () => {
    expect(normalizeText("عِطْرٌ  أمِيرة ١٠٠")).toBe("عطر اميره 100");
  });

  it("يطابق نفس المنتج مكتوبًا بطرق مختلفة", () => {
    const a = fingerprint("عطر العود الملكي ١٠٠ مل");
    const b = fingerprint("عطر عود ملكي 100ml");
    const c = fingerprint("ملكي - عطر العُود (100 ML)");
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toBe("name:100ml عطر عود ملكي");
  });

  it("لا يدمج أحجامًا مختلفة", () => {
    expect(fingerprint("عطر عود ملكي 100ml")).not.toBe(fingerprint("عطر عود ملكي 50ml"));
  });

  it("يترك «ألعاب» ولا يحذف منها «ال»", () => {
    expect(tokens("ألعاب أطفال")).toEqual(["العاب", "اطفال"]);
  });

  it("الاسم من كلمة واحدة عام جدًا فلا بصمة له", () => {
    expect(fingerprint("عطر")).toBeNull();
  });

  it("يقبل الباركود الصحيح فقط ويقدمه على الاسم", () => {
    expect(validGtin("6281000000113")).toBe("06281000000113");
    expect(validGtin("6281000000114")).toBeNull(); // رقم فحص خاطئ
    expect(validGtin("0000000000000")).toBeNull();
    expect(validGtin("1111111111111")).toBeNull();
    expect(fingerprint("أي اسم", "6281000000113")).toBe("gtin:06281000000113");
  });
});

describe("المناطق", () => {
  it("يربط المدن بالعربية والإنجليزية بمناطقها", () => {
    expect(regionFor("الرياض", "SA")).toBe("RIYADH");
    expect(regionFor("Jeddah", "Saudi Arabia")).toBe("MAKKAH");
    expect(regionFor("جدة - حي الصفا", "السعودية")).toBe("MAKKAH");
    expect(regionFor("المدينة المنورة", null)).toBe("MADINAH");
    expect(regionFor("المدينة", "SA")).toBe("MADINAH");
    expect(regionFor("Al Khobar", "SA")).toBe("EASTERN");
    expect(regionFor("خميس مشيط", "SA")).toBe("ASIR");
  });

  it("دول الخليج منطقة واحدة لكل دولة، والمجهول لا منطقة له", () => {
    expect(regionFor("Dubai", "AE")).toBe("AE");
    expect(regionFor("الكويت", "الكويت")).toBe("KW");
    expect(regionFor("قرية غير معروفة", "SA")).toBeNull();
    expect(regionFor(null, null)).toBeNull();
    expect(regionFor("Paris", "FR")).toBeNull();
    expect(countryCode("المملكة العربية السعودية")).toBe("SA");
  });
});

describe("التصنيف الموحد", () => {
  it("يبدأ بأقسام المتجر ثم اسم المنتج", () => {
    expect(classify(["العطور"], "منتج رقم 5")).toBe("perfumes");
    expect(classify([], "سماعة بلوتوث لاسلكية")).toBe("electronics");
    expect(classify(["Perfumes"], "سماعة")).toBe("perfumes");
    expect(classify(["ألعاب الأطفال"], "مكعبات")).toBe("kids");
    expect(classify([], "شيء غامض")).toBe("other");
  });
});

describe("قراءة طلبات سلة", () => {
  const order = {
    id: 9001,
    date: { date: "2026-10-01 21:30:00.000000", timezone_type: 3, timezone: "Asia/Riyadh" },
    status: { id: 1, name: "تم التنفيذ", slug: "completed" },
    currency: "SAR",
    customer: { id: 5, first_name: "سارة", mobile: "555555555", email: "sara@example.com", city: "الرياض" },
    shipping: { address: { city: "جدة", country: "SA", street_number: "12" } },
    items: [
      { id: 1, name: "عطر عود ملكي 100ml", sku: "OUD-1", quantity: 2, product: { id: 77 }, amounts: { total: { amount: 398.5, currency: "SAR" } } },
      { id: 2, name: "", quantity: 1 },
      { id: 3, name: "بخور", quantity: 0 },
    ],
  };

  it("يأخذ المنتجات والمدينة من عنوان الشحن ويتجاهل بيانات العميل", () => {
    const p = parseOrder(order)!;
    expect(p.id).toBe(9001);
    expect(p.lines).toHaveLength(1);
    const l = p.lines[0];
    expect(l).toMatchObject({ salla_product_id: 77, quantity: 2, revenue_halalas: 39850, city: "جدة", region: "MAKKAH", counted: true, line_key: "1" });
    expect(l.ordered_at.toISOString()).toBe("2026-10-01T18:30:00.000Z");
    expect(JSON.stringify(p)).not.toMatch(/sara|555555555|سارة/);
  });

  it("الطلبات الملغاة وغير المدفوعة لا تُحسب", () => {
    expect(parseOrder({ ...order, status: { slug: "canceled" } })!.lines[0].counted).toBe(false);
    expect(parseOrder({ ...order, status: "payment_pending" })!.lines[0].counted).toBe(false);
    expect(parseOrder({ ...order, status: { slug: "delivered" } })!.lines[0].counted).toBe(true);
  });

  it("يحسب الإيراد من سعر الوحدة إذا غاب الإجمالي", () => {
    const p = parseOrder({ id: 1, items: [{ name: "قهوة مختصة", quantity: 3, price: { amount: "45.00" } }] })!;
    expect(p.lines[0].revenue_halalas).toBe(13500);
    expect(p.lines[0].line_key).toBe("x:0");
  });

  it("يرفض ما ليس طلبًا", () => {
    expect(parseOrder(null)).toBeNull();
    expect(parseOrder({ items: [] })).toBeNull();
  });

  it("يقرأ المنتج وأقسامه وسعره", () => {
    expect(parseProduct({ id: 77, name: "عطر", sku: "A", price: { amount: 199, currency: "SAR" }, categories: [{ id: 1, name: "العطور" }] })).toEqual({
      salla_product_id: 77, name: "عطر", sku: "A", gtin: null, category_names: ["العطور"], price_halalas: 19900, status: null,
    });
  });

  it("يقرأ غلاف الحدث وتواريخه", () => {
    expect(parseEnvelope({ event: "order.created", merchant: 123, created_at: "2026-10-01 10:00:00", data: { id: 1 } })).toMatchObject({
      event: "order.created", merchant: 123, data: { id: 1 },
    });
    expect(parseEnvelope({ merchant: 1 })).toBeNull();
    expect(parseSallaDate("2026-10-01T10:00:00Z")!.toISOString()).toBe("2026-10-01T10:00:00.000Z");
  });
});

describe("رموز سلة", () => {
  it("يفهم expires_in بالثواني وexpires كطابع زمني", () => {
    const now = Date.UTC(2026, 9, 1);
    expect(tokenSetFrom({ access_token: "a", refresh_token: "r", expires_in: 1209600 }, now).expires_at.toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(tokenSetFrom({ access_token: "a", expires: 1790000000 }, now).expires_at.getTime()).toBe(1790000000 * 1000);
    expect(() => tokenSetFrom({}, now)).toThrow();
  });

  it("التشفير يعيد النص نفسه ويرفض التلاعب", () => {
    const key = Buffer.alloc(32, 1).toString("base64");
    const sealed = encrypt("secret-token", key);
    expect(sealed).not.toContain("secret-token");
    expect(decrypt(sealed, key)).toBe("secret-token");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."), key)).toThrow();
    expect(() => decrypt(sealed, Buffer.alloc(32, 2).toString("base64"))).toThrow();
  });

  it("يتحقق من توقيع سلة على الجسم الخام", () => {
    const body = '{"event":"order.created","merchant":1}';
    const sig = createHmac("sha256", "s3cret").update(body).digest("hex");
    expect(verifySallaSignature(body, sig, "s3cret")).toBe(true);
    expect(verifySallaSignature(body, sig.toUpperCase(), "s3cret")).toBe(true);
    expect(verifySallaSignature(body + " ", sig, "s3cret")).toBe(false);
    expect(verifySallaSignature(body, sig, "other")).toBe(false);
    expect(verifySallaSignature(body, null, "s3cret")).toBe(false);
  });
});

describe("التوثيق", () => {
  it("يتحقق من أرقام الوثائق ويوحدها", () => {
    expect(normalizeVerificationNumber("commercial_register", "١٠١٠١٢٣٤٥٦")).toBe("1010123456");
    expect(normalizeVerificationNumber("commercial_register", "7001234567")).toBe("7001234567");
    expect(normalizeVerificationNumber("commercial_register", "101012345")).toBeNull();
    expect(normalizeVerificationNumber("commercial_register", "9010123456")).toBeNull();
    expect(normalizeVerificationNumber("freelance", "fl 123456789")).toBe("FL-123456789");
    expect(normalizeVerificationNumber("freelance", "abc")).toBeNull();
    expect(normalizeVerificationNumber("maroof", "12345")).toBe("12345");
  });

  it("يحدد نوع الملف من بايتاته", () => {
    expect(sniffDocument(new TextEncoder().encode("%PDF-1.7 ..."))).toBe("application/pdf");
    expect(sniffDocument(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(sniffDocument(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffDocument(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(safeFileName("../../etc/passwd")).not.toMatch(/[/\\]/);
  });
});
