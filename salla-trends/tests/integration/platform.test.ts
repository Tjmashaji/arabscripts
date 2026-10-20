// اختبارات تكامل على Postgres حقيقي (قاعدة salla_trends_test، تُجهَّز بـ tests/global-db.sh).
// تغطي: الويب هوك وتوقيعه وعدم التكرار، العزل بين المتاجر بـ RLS، قواعد خصوصية الترند، التوثيق، تجديد الرموز والمزامنة.
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as webhook } from "@/app/api/salla/webhook/route";
import { decrypt } from "@/server/crypto";
import { asAdmin, asStore, asWorker, closePools } from "@/server/db";
import { setFetch } from "@/server/salla/client";
import { accessTokenFor } from "@/server/stores";
import { computeTrends, runDueJobs } from "@/server/sync";
import { latestRun, opportunities, trendItems } from "@/server/queries";

const SECRET = process.env.SALLA_WEBHOOK_SECRET!;
const owner = new Client({ connectionString: "postgres://trends_owner:trends_owner_dev@127.0.0.1:5432/salla_trends_test" });

async function reset() {
  await owner.query(
    "TRUNCATE stores, store_tokens, admins, sessions, webhook_events, products, order_lines, sync_jobs, trend_runs, trend_items, verification_requests, audit_log, rate_limits CASCADE",
  );
}

function send(payload: unknown, opts: { secret?: string; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(payload);
  const sig = createHmac("sha256", opts.secret ?? SECRET).update(raw).digest("hex");
  return webhook(
    new NextRequest("http://localhost:3000/api/salla/webhook", {
      method: "POST",
      body: raw,
      headers: { "content-type": "application/json", "x-salla-signature": sig, "x-salla-security-strategy": "Signature" },
    }),
  );
}

const authorize = (merchant: number, token = `access-${merchant}`, expiresInDays = 14) =>
  send({
    event: "app.store.authorize",
    merchant,
    created_at: "2026-10-01 10:00:00",
    data: { access_token: token, refresh_token: `refresh-${merchant}`, expires: Math.floor(Date.now() / 1000) + expiresInDays * 86400, scope: "offline_access" },
  });

let orderSeq = 1000;
function orderEvent(merchant: number, items: { name: string; qty: number; price?: number; productId?: number }[], opts: { city?: string; daysAgo?: number; status?: string; id?: number } = {}) {
  const d = new Date(Date.now() - (opts.daysAgo ?? 1) * 86400_000);
  const riyadh = new Date(d.getTime() + 3 * 3600_000).toISOString().replace("T", " ").slice(0, 19);
  return send({
    event: "order.created",
    merchant,
    created_at: riyadh,
    data: {
      id: opts.id ?? ++orderSeq,
      date: { date: `${riyadh}.000000`, timezone: "Asia/Riyadh" },
      status: { slug: opts.status ?? "completed" },
      shipping: { address: { city: opts.city ?? "الرياض", country: "SA" } },
      customer: { first_name: "عميل", mobile: "500000000" },
      items: items.map((it, i) => ({ id: `${orderSeq}-${i}`, name: it.name, quantity: it.qty, product: { id: it.productId ?? null }, amounts: { total: { amount: (it.price ?? 100) * it.qty } } })),
    },
  });
}

const storeId = async (merchant: number) => (await owner.query("SELECT id FROM stores WHERE salla_merchant_id = $1", [merchant])).rows[0].id as string;
const consent = (merchants: number[]) => owner.query("UPDATE stores SET contributes = true, consent_at = now() WHERE salla_merchant_id = ANY($1)", [merchants]);

beforeAll(async () => {
  await owner.connect();
});
afterAll(async () => {
  setFetch(null);
  await owner.end();
  await closePools();
});
beforeEach(async () => {
  await reset();
  setFetch(null);
});

describe("ويب هوك سلة", () => {
  it("يرفض التوقيع الخاطئ والجسم غير الصالح", async () => {
    expect((await send({ event: "app.installed", merchant: 1 }, { secret: "wrong" })).status).toBe(401);
    expect((await send(null, { raw: "not json" })).status).toBe(400);
    expect((await owner.query("SELECT count(*) FROM webhook_events")).rows[0].count).toBe("0");
  });

  it("الربط يحفظ الرموز مشفرة وينشئ مهام المزامنة، والتكرار لا يعالج مرتين", async () => {
    const res = await authorize(111);
    expect(res.status).toBe(200);
    const id = await storeId(111);
    const tok = (await owner.query("SELECT * FROM store_tokens WHERE store_id = $1", [id])).rows[0];
    expect(tok.access_token_enc).not.toContain("access-111");
    expect(decrypt(tok.access_token_enc, process.env.TOKEN_ENCRYPTION_KEY!)).toBe("access-111");
    const jobs = (await owner.query("SELECT kind FROM sync_jobs WHERE store_id = $1 ORDER BY kind", [id])).rows.map((r) => r.kind);
    expect(jobs).toEqual(["backfill_orders", "sync_products", "sync_store"]);

    const again = await authorize(111);
    // نفس الجسم بالضبط؟ لا: expires يتغير مع الوقت أحيانًا، فنعيد إرسال نفس النص يدويًا
    expect(again.status).toBe(200);
    const raw = JSON.stringify({ event: "app.installed", merchant: 111, data: {} });
    await send(null, { raw });
    const dup = await (await send(null, { raw })).json();
    expect(dup.duplicate).toBe(true);
  });

  it("الطلب يُخزن بلا بيانات العميل، والإلغاء يخرجه من الحساب، وحذف التطبيق يمسح كل شيء", async () => {
    await authorize(222);
    await orderEvent(222, [{ name: "عطر عود ملكي 100ml", qty: 2, price: 199 }], { id: 5001, city: "جدة" });
    const id = await storeId(222);
    const line = (await owner.query("SELECT * FROM order_lines WHERE store_id = $1", [id])).rows[0];
    expect(line).toMatchObject({ quantity: 2, region: "MAKKAH", counted: true, fingerprint: "name:100ml عطر عود ملكي", taxonomy: "perfumes" });
    expect(JSON.stringify(line)).not.toContain("500000000");

    await send({ event: "order.status.updated", merchant: 222, data: { order: { id: 5001 }, status: { slug: "canceled" } } });
    expect((await owner.query("SELECT counted FROM order_lines WHERE store_id = $1", [id])).rows[0].counted).toBe(false);

    await send({ event: "app.uninstalled", merchant: 222, data: {} });
    const left = await owner.query(
      "SELECT (SELECT count(*) FROM order_lines WHERE store_id = $1) l, (SELECT count(*) FROM store_tokens WHERE store_id = $1) t, (SELECT status FROM stores WHERE id = $1) s",
      [id],
    );
    expect(left.rows[0]).toEqual({ l: "0", t: "0", s: "uninstalled" });
  });

  it("المنتج يحدد بصمة سطوره (الباركود يتقدم على الاسم)", async () => {
    await authorize(333);
    await orderEvent(333, [{ name: "سماعة لاسلكية برو", qty: 1, productId: 42 }]);
    await send({ event: "product.updated", merchant: 333, data: { id: 42, name: "سماعة لاسلكية برو", gtin: "6281000000113", categories: [{ name: "الإلكترونيات" }] } });
    const r = (await owner.query("SELECT fingerprint, taxonomy FROM order_lines WHERE salla_product_id = 42")).rows[0];
    expect(r).toEqual({ fingerprint: "gtin:06281000000113", taxonomy: "electronics" });
  });
});

describe("العزل بين المتاجر (RLS)", () => {
  it("كل متجر يرى بياناته فقط، ولا أحد يرى الرموز من تطبيق الويب", async () => {
    await authorize(1);
    await authorize(2);
    await orderEvent(1, [{ name: "قهوة مختصة إثيوبي", qty: 1 }]);
    await orderEvent(2, [{ name: "تمر سكري فاخر", qty: 1 }]);
    const a = await storeId(1);
    const mine = await asStore(a, (tx) => tx.q<{ name: string }>("SELECT name FROM order_lines"));
    expect(mine.map((r) => r.name)).toEqual(["قهوة مختصة إثيوبي"]);
    expect(await asStore(a, (tx) => tx.q("SELECT id FROM stores"))).toHaveLength(1);
    await expect(asStore(a, (tx) => tx.q("SELECT * FROM store_tokens"))).rejects.toMatchObject({ code: "42501" });
    // لا يستطيع التاجر توثيق نفسه
    await expect(asStore(a, (tx) => tx.q("UPDATE stores SET verification_status = 'verified'"))).rejects.toMatchObject({ code: "42501" });
    // ولا حذف بيانات غيره
    await asStore(a, (tx) => tx.q("DELETE FROM order_lines"));
    expect((await owner.query("SELECT count(*) FROM order_lines")).rows[0].count).toBe("1");
  });
});

describe("حساب الترند وقواعد الخصوصية", () => {
  async function scenario() {
    for (const m of [10, 11, 12, 13]) await authorize(m);
    await consent([10, 11, 12, 13]);
    // منتج يبيعه 4 متاجر، ومبيعاته تتضاعف هذا الأسبوع
    for (const m of [10, 11, 12, 13]) {
      await orderEvent(m, [{ name: "عطر عود ملكي 100ml", qty: 1 }], { daysAgo: 10, city: "الرياض" });
      await orderEvent(m, [{ name: "عطر العود الملكي ١٠٠ مل", qty: 4 }], { daysAgo: 2, city: m === 13 ? "جدة" : "الرياض" });
    }
    // منتج يبيعه متجران فقط: لا يظهر مهما كانت مبيعاته
    for (const m of [10, 11]) await orderEvent(m, [{ name: "شاحن سريع 65 واط", qty: 50 }], { daysAgo: 1 });
    // منتج في 3 متاجر لكن متجرًا واحدًا يملك 90% من مبيعاته: لا يظهر
    await orderEvent(10, [{ name: "بخور كمبودي فاخر", qty: 90 }], { daysAgo: 1 });
    await orderEvent(11, [{ name: "بخور كمبودي فاخر", qty: 5 }], { daysAgo: 1 });
    await orderEvent(12, [{ name: "بخور كمبودي فاخر", qty: 5 }], { daysAgo: 1 });
    // طلب ملغي لا يُحسب
    await orderEvent(13, [{ name: "عطر عود ملكي 100ml", qty: 100 }], { daysAgo: 1, status: "canceled" });
  }

  it("يظهر المنتج المشترك بين متاجر كافية فقط، ويحسب النمو", async () => {
    await scenario();
    const run = await computeTrends();
    const items = (await owner.query("SELECT * FROM trend_items WHERE run_id = $1 AND window_days = 7 AND region = 'ALL' AND taxonomy = 'ALL'", [run])).rows;
    const names = new Set(items.map((i) => i.display_name));
    expect([...names]).toHaveLength(1);
    const best = items.find((i) => i.kind === "best")!;
    expect(best).toMatchObject({ units: 16, stores_count: 4, fingerprint: "name:100ml عطر عود ملكي" });
    const trending = items.find((i) => i.kind === "trending")!;
    expect(trending.units).toBe(16);
    expect(trending.prev_units).toBe(4);
    expect(Number(trending.growth)).toBe(3);
    // منطقة الرياض: 3 متاجر فقط (الرابع شحن لجدة) فيظهر؛ ومنطقة مكة متجر واحد فلا يظهر
    const byRegion = (await owner.query("SELECT region, stores_count FROM trend_items WHERE run_id = $1 AND kind = 'best' AND window_days = 7 AND taxonomy = 'ALL'", [run])).rows;
    expect(byRegion).toEqual(expect.arrayContaining([{ region: "RIYADH", stores_count: 3 }]));
    expect(byRegion.find((r) => r.region === "MAKKAH")).toBeUndefined();
  });

  it("سحب الموافقة يُخرج المتجر من الحساب ويحجب عنه الترند", async () => {
    await scenario();
    await owner.query("UPDATE stores SET contributes = false WHERE salla_merchant_id = 13");
    const run = await computeTrends();
    // بقي 3 متاجر مساهمة فيظهر المنتج بثلاثة
    const best = (await owner.query("SELECT stores_count, units FROM trend_items WHERE run_id = $1 AND kind = 'best' AND window_days = 7 AND region = 'ALL' AND taxonomy = 'ALL'", [run])).rows;
    expect(best).toEqual([{ stores_count: 3, units: 12 }]);
    const s13 = await storeId(13);
    expect(await asStore(s13, (tx) => latestRun(tx))).toBeUndefined();
    const s10 = await storeId(10);
    const r = await asStore(s10, (tx) => latestRun(tx));
    expect(Number(r!.id)).toBe(run);
    const rows = await asStore(s10, (tx) => trendItems(tx, r!.id, { kind: "best", window: 7, region: "ALL", taxonomy: "ALL" }));
    expect(rows[0]).toMatchObject({ display_name: expect.any(String), mine: true, taxonomy_hint: "perfumes" });
  });

  it("الفرص: صاعد في تصنيف المتجر ولا يبيعه", async () => {
    await scenario();
    await authorize(20);
    await consent([20]);
    await send({ event: "product.created", merchant: 20, data: { id: 1, name: "دهن عود هندي", categories: [{ name: "العطور" }] } });
    const run = String(await computeTrends());
    const s20 = await storeId(20);
    const ops = await asStore(s20, (tx) => opportunities(tx, run));
    expect(ops.map((o) => o.fingerprint)).toEqual(["name:100ml عطر عود ملكي"]);
    const s10 = await storeId(10);
    expect(await asStore(s10, (tx) => opportunities(tx, run))).toEqual([]);
  });
});

describe("التوثيق", () => {
  it("التاجر يقدم، والمسؤول يعتمد، والصفحة العامة تعرض الحالة", async () => {
    await authorize(500);
    const id = await storeId(500);
    const admin = (await owner.query("INSERT INTO admins (email, name, password_hash) VALUES ('a@x.sa', 'مدير', 'x') RETURNING id")).rows[0].id;
    await asStore(id, (tx) =>
      tx.q("INSERT INTO verification_requests (store_id, kind, number, legal_name, document, document_mime, document_name) VALUES (app.current_store(), 'commercial_register', '1010123456', 'مؤسسة التجربة', $1, 'application/pdf', 'cr.pdf')", [Buffer.from("%PDF-1.4")]),
    );
    // لا يستطيع التاجر تقديم طلب باسم متجر آخر
    await authorize(501);
    const other = await storeId(501);
    await expect(
      asStore(id, (tx) => tx.q("INSERT INTO verification_requests (store_id, kind, number, legal_name, document, document_mime, document_name) VALUES ($1, 'maroof', '123', 'x', '\\x00', 'image/png', 'a.png')", [other])),
    ).rejects.toMatchObject({ code: "42501" });
    // ولا مراجعة طلبه بنفسه
    const req = (await owner.query("SELECT id FROM verification_requests WHERE store_id = $1", [id])).rows[0].id;
    await expect(asStore(id, (tx) => tx.q("SELECT app.review_verification($1, true, '')", [req]))).rejects.toMatchObject({ code: "42501" });
    expect((await owner.query("SELECT verification_status FROM stores WHERE id = $1", [id])).rows[0].verification_status).toBe("pending");

    await asAdmin(admin, (tx) => tx.q("SELECT app.review_verification($1, true, 'مطابق')", [req]));
    const pub = await asWorker((tx) => tx.one("SELECT * FROM app.public_verification((SELECT public_id FROM stores WHERE id = $1))", [id]));
    expect(pub).toMatchObject({ verified: true, legal_name: "مؤسسة التجربة", active: true });
    // مراجعة مزدوجة مرفوضة
    await expect(asAdmin(admin, (tx) => tx.q("SELECT app.review_verification($1, false, 'x')", [req]))).rejects.toMatchObject({ code: "P0002" });
  });
});

describe("الرموز والمزامنة", () => {
  it("يجدد الرمز القريب من الانتهاء مرة واحدة فقط حتى مع طلبين متوازيين", async () => {
    await authorize(700, "old-access", 0.5);
    const id = await storeId(700);
    let refreshes = 0;
    setFetch(async (url, init) => {
      if (String(url).endsWith("/oauth2/token")) {
        refreshes++;
        expect(String(init?.body)).toContain("refresh_token=refresh-700");
        await new Promise((r) => setTimeout(r, 100));
        return Response.json({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 1209600 });
      }
      throw new Error("unexpected " + url);
    });
    const [a, b] = await Promise.all([accessTokenFor(id), accessTokenFor(id)]);
    expect([a, b]).toEqual(["new-access", "new-access"]);
    expect(refreshes).toBe(1);
  });

  it("يسحب المنتجات والطلبات السابقة صفحة صفحة", async () => {
    await authorize(800);
    await owner.query("UPDATE sync_jobs SET run_after = now()");
    const calls: string[] = [];
    setFetch(async (url) => {
      const u = new URL(String(url));
      calls.push(u.pathname + u.search);
      if (u.pathname.endsWith("/oauth2/user/info")) return Response.json({ data: { email: "m@x.sa", merchant: { id: 800, name: "متجر الاختبار", domain: "https://t.example" } } });
      if (u.pathname.endsWith("/products")) {
        const page = Number(u.searchParams.get("page"));
        return Response.json({ data: [{ id: page, name: `منتج رقم ${page}`, categories: [{ name: "العطور" }] }], pagination: { currentPage: page, totalPages: 2 } });
      }
      if (u.pathname.endsWith("/orders")) return Response.json({ data: [{ id: 9 }], pagination: { currentPage: 1, totalPages: 1 } });
      if (u.pathname.endsWith("/orders/9")) return Response.json({ data: { id: 9, status: { slug: "delivered" }, shipping: { address: { city: "الدمام" } }, items: [{ id: 1, name: "منتج رقم 1", quantity: 3, product: { id: 1 } }] } });
      return new Response("not found", { status: 404 });
    });
    for (let i = 0; i < 4; i++) await runDueJobs({ budgetMs: 10_000 });
    const id = await storeId(800);
    const s = (await owner.query("SELECT name, domain, last_synced_at FROM stores WHERE id = $1", [id])).rows[0];
    expect(s.name).toBe("متجر الاختبار");
    expect(s.last_synced_at).not.toBeNull();
    expect((await owner.query("SELECT count(*) FROM products WHERE store_id = $1", [id])).rows[0].count).toBe("2");
    const line = (await owner.query("SELECT quantity, region, taxonomy FROM order_lines WHERE store_id = $1", [id])).rows[0];
    expect(line).toEqual({ quantity: 3, region: "EASTERN", taxonomy: "perfumes" });
    expect((await owner.query("SELECT array_agg(DISTINCT status) s FROM sync_jobs WHERE store_id = $1", [id])).rows[0].s).toEqual(["done"]);
  });

  it("رفض سلة للصلاحية يوقف المهمة دون إعادة محاولة لا نهائية", async () => {
    await authorize(900);
    await owner.query("UPDATE sync_jobs SET run_after = now()");
    setFetch(async () => new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 }));
    await runDueJobs({ budgetMs: 10_000 });
    const rows = (await owner.query("SELECT status, last_error FROM sync_jobs WHERE store_id = $1", [await storeId(900)])).rows;
    expect(rows.every((r) => r.status === "failed" && /الصلاحية/.test(r.last_error))).toBe(true);
  });
});
