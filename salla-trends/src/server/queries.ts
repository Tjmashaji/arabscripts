import "server-only";
import type { Tx } from "./db";

// استعلامات القراءة للصفحات. كلها تعمل بمعاملة trends_app، فـ RLS هو من يقصر النتائج على المتجر الحالي.

export type StoreRow = {
  id: string;
  name: string;
  domain: string | null;
  public_id: string;
  contributes: boolean;
  consent_at: Date | null;
  verification_status: "unverified" | "pending" | "verified" | "rejected";
  verified_at: Date | null;
  verified_legal_name: string | null;
  installed_at: Date;
  last_synced_at: Date | null;
};

export const myStore = (tx: Tx) => tx.one<StoreRow>("SELECT * FROM stores WHERE id = trends.current_store()");

export type JobRow = { kind: string; status: string; page: number; last_error: string | null; updated_at: Date };
export const myJobs = (tx: Tx) =>
  tx.q<JobRow>("SELECT DISTINCT ON (kind) kind, status, page, last_error, updated_at FROM sync_jobs ORDER BY kind, created_at DESC");

export type OwnStats = { units: number; orders: number; revenue_halalas: number; products: number };
export async function ownStats(tx: Tx, days = 30): Promise<OwnStats> {
  const r = await tx.one<{ units: string; orders: string; revenue: string; products: string }>(
    `SELECT coalesce(sum(quantity), 0) AS units, count(DISTINCT salla_order_id) AS orders, coalesce(sum(revenue_halalas), 0) AS revenue,
            (SELECT count(*) FROM products) AS products
     FROM order_lines WHERE counted AND ordered_at >= now() - make_interval(days => $1)`,
    [days],
  );
  return { units: Number(r?.units ?? 0), orders: Number(r?.orders ?? 0), revenue_halalas: Number(r?.revenue ?? 0), products: Number(r?.products ?? 0) };
}

export type OwnProduct = { fingerprint: string; name: string; units: number; revenue_halalas: number; taxonomy: string };
export const ownTopProducts = (tx: Tx, days = 30, limit = 10) =>
  tx.q<OwnProduct>(
    `SELECT fingerprint, mode() WITHIN GROUP (ORDER BY name) AS name, sum(quantity)::int AS units, sum(revenue_halalas)::bigint AS revenue_halalas,
            mode() WITHIN GROUP (ORDER BY taxonomy) AS taxonomy
     FROM order_lines WHERE counted AND ordered_at >= now() - make_interval(days => $1)
     GROUP BY fingerprint ORDER BY units DESC LIMIT $2`,
    [days, limit],
  );

export type TrendRun = { id: string; as_of: Date; finished_at: Date; contributing_stores: number; min_stores: number; items: number };
export const latestRun = (tx: Tx) => tx.one<TrendRun>("SELECT id, as_of, finished_at, contributing_stores, min_stores, items FROM latest_trend_run");

export type TrendItem = {
  rank: number;
  fingerprint: string;
  display_name: string;
  units: number;
  prev_units: number;
  stores_count: number;
  orders_count: number;
  growth: string | null;
  score: string;
  median_price_halalas: string | null;
  taxonomy_hint: string | null;
  mine: boolean;
  prev_rank: number | null;
};

export type TrendFilter = { kind: "best" | "trending"; window: 7 | 30; region: string; taxonomy: string; limit?: number };

// الترتيب في اللقطة السابقة يعطي سهم الصعود والهبوط، و«mine» يعلّم ما يبيعه المتجر الحالي
export async function trendItems(tx: Tx, runId: string, f: TrendFilter): Promise<TrendItem[]> {
  return tx.q<TrendItem>(
    `WITH prev AS (
       SELECT id FROM trend_runs WHERE finished_at IS NOT NULL AND id < $1 AND as_of <= (SELECT as_of FROM trend_runs WHERE id = $1) - interval '20 hours'
       ORDER BY id DESC LIMIT 1
     ), mine AS (
       SELECT DISTINCT fingerprint FROM products WHERE store_id = trends.current_store()
       UNION SELECT DISTINCT fingerprint FROM order_lines WHERE store_id = trends.current_store()
     )
     SELECT t.rank, t.fingerprint, t.display_name, t.units, t.prev_units, t.stores_count, t.orders_count, t.growth, t.score, t.median_price_halalas,
            (SELECT x.taxonomy FROM trend_items x WHERE x.run_id = t.run_id AND x.fingerprint = t.fingerprint AND x.taxonomy <> 'ALL' LIMIT 1) AS taxonomy_hint,
            EXISTS (SELECT 1 FROM mine m WHERE m.fingerprint = t.fingerprint) AS mine,
            (SELECT p.rank FROM trend_items p WHERE p.run_id = (SELECT id FROM prev) AND p.kind = t.kind AND p.window_days = t.window_days
               AND p.region = t.region AND p.taxonomy = t.taxonomy AND p.fingerprint = t.fingerprint) AS prev_rank
     FROM trend_items t
     WHERE t.run_id = $1 AND t.kind = $2 AND t.window_days = $3 AND t.region = $4 AND t.taxonomy = $5
     ORDER BY t.rank LIMIT $6`,
    [runId, f.kind, f.window, f.region, f.taxonomy, f.limit ?? 50],
  );
}

// الفرص: منتجات صاعدة في تصنيفات المتجر نفسها، ولا يبيعها المتجر بعد
export async function opportunities(tx: Tx, runId: string, window: 7 | 30 = 7, limit = 30) {
  return tx.q<TrendItem & { taxonomy: string }>(
    `WITH my_tax AS (
       SELECT taxonomy FROM (
         SELECT taxonomy, count(*) n FROM products WHERE store_id = trends.current_store() AND taxonomy <> 'other' GROUP BY taxonomy
         UNION ALL
         SELECT taxonomy, sum(quantity) FROM order_lines WHERE store_id = trends.current_store() AND taxonomy <> 'other' GROUP BY taxonomy
       ) s GROUP BY taxonomy ORDER BY sum(n) DESC LIMIT 4
     ), mine AS (
       SELECT fingerprint FROM products WHERE store_id = trends.current_store()
       UNION SELECT fingerprint FROM order_lines WHERE store_id = trends.current_store()
     )
     SELECT (row_number() OVER (ORDER BY t.score DESC))::int AS rank, t.fingerprint, t.display_name, t.units, t.prev_units, t.stores_count,
            t.orders_count, t.growth, t.score, t.median_price_halalas, t.taxonomy, t.taxonomy AS taxonomy_hint, false AS mine, NULL::int AS prev_rank
     FROM trend_items t
     WHERE t.run_id = $1 AND t.kind = 'trending' AND t.window_days = $2 AND t.region = 'ALL'
       AND t.taxonomy IN (SELECT taxonomy FROM my_tax)
       AND NOT EXISTS (SELECT 1 FROM mine m WHERE m.fingerprint = t.fingerprint)
     ORDER BY t.score DESC LIMIT $3`,
    [runId, window, limit],
  );
}

export type VerificationRow = {
  id: string;
  kind: string;
  number: string;
  legal_name: string;
  document_name: string;
  status: string;
  reviewer_note: string | null;
  created_at: Date;
  reviewed_at: Date | null;
};
export const myVerifications = (tx: Tx) =>
  tx.q<VerificationRow>(
    "SELECT id, kind, number, legal_name, document_name, status, reviewer_note, created_at, reviewed_at FROM verification_requests ORDER BY created_at DESC LIMIT 10",
  );

// ── الإدارة ──
export async function adminOverview(tx: Tx) {
  return tx.one<{ stores: string; active: string; contributing: string; verified: string; pending: string; lines_30d: string; webhook_errors: string; failed_jobs: string }>(
    `SELECT (SELECT count(*) FROM stores) AS stores,
            (SELECT count(*) FROM stores WHERE status = 'active') AS active,
            (SELECT count(*) FROM stores WHERE status = 'active' AND contributes) AS contributing,
            (SELECT count(*) FROM stores WHERE verification_status = 'verified') AS verified,
            (SELECT count(*) FROM verification_requests WHERE status = 'pending') AS pending,
            (SELECT count(*) FROM order_lines WHERE ordered_at >= now() - interval '30 days') AS lines_30d,
            (SELECT count(*) FROM webhook_events WHERE error IS NOT NULL AND processed_at IS NULL AND received_at >= now() - interval '7 days') AS webhook_errors,
            (SELECT count(*) FROM sync_jobs WHERE status = 'failed' AND updated_at >= now() - interval '7 days') AS failed_jobs`,
  );
}

export const adminStores = (tx: Tx) =>
  tx.q<StoreRow & { salla_merchant_id: string; status: string; lines: string }>(
    `SELECT s.*, (SELECT count(*) FROM order_lines l WHERE l.store_id = s.id) AS lines
     FROM stores s ORDER BY s.created_at DESC LIMIT 200`,
  );

export const adminVerifications = (tx: Tx, status: string) =>
  tx.q<VerificationRow & { store_id: string; store_name: string; store_domain: string | null; document_mime: string }>(
    `SELECT v.id, v.kind, v.number, v.legal_name, v.document_name, v.document_mime, v.status, v.reviewer_note, v.created_at, v.reviewed_at,
            v.store_id, s.name AS store_name, s.domain AS store_domain
     FROM verification_requests v JOIN stores s ON s.id = v.store_id
     WHERE v.status = $1 ORDER BY v.created_at ${status === "pending" ? "ASC" : "DESC"} LIMIT 100`,
    [status],
  );
