-- حساب الترند والأكثر مبيعًا من مبيعات المتاجر المساهمة.
--
-- قواعد الخصوصية (تُطبق قبل أن يُكتب أي صف):
--   1) لا يظهر منتج إلا إذا باعه p_min_stores متاجر مختلفة على الأقل في الفترة الحالية.
--   2) لا يظهر منتج يأتي أكثر من p_max_share من مبيعاته من متجر واحد (حتى لا تكشف الأرقام متجرًا بعينه).
--   3) نسبة النمو لا تُعرض إلا إذا حقق الشرط (1) في الفترة السابقة أيضًا؛ وإلا يُعلَّم المنتج «ناشئ».
--
-- الترتيب:
--   best:     مجموع الوحدات في الفترة.
--   trending: درجة z تقريبية بافتراض توزيع بواسون: (الحالي − السابق) / √(السابق + 5).
--             تكافئ النمو الكبير على حجم معقول، ولا تنخدع بقفزة من 1 إلى 4.

SET search_path = trends;

CREATE OR REPLACE FUNCTION trends.compute_trends(
  p_as_of timestamptz DEFAULT now(),
  p_min_stores integer DEFAULT 3,
  p_max_share numeric DEFAULT 0.7,
  p_min_units integer DEFAULT 10,
  p_top integer DEFAULT 50
) RETURNS bigint
LANGUAGE plpgsql SET search_path = trends AS $$
DECLARE
  v_run bigint;
  w integer;
  v_items integer;
BEGIN
  INSERT INTO trend_runs (as_of, min_stores, contributing_stores)
  VALUES (p_as_of, p_min_stores, (SELECT count(*) FROM stores WHERE status = 'active' AND contributes))
  RETURNING id INTO v_run;

  FOREACH w IN ARRAY ARRAY[7, 30] LOOP
    WITH lines AS (
      SELECT ol.store_id, ol.salla_order_id, ol.fingerprint, ol.name, ol.taxonomy, ol.region, ol.quantity, ol.revenue_halalas,
             ol.ordered_at >= p_as_of - make_interval(days => w) AS cur
      FROM order_lines ol JOIN stores s ON s.id = ol.store_id
      WHERE ol.counted AND s.status = 'active' AND s.contributes
        AND ol.ordered_at >= p_as_of - make_interval(days => 2 * w) AND ol.ordered_at < p_as_of
    ),
    -- كل سطر يدخل في أربع مجموعات: (المنطقة، التصنيف)، (الكل، التصنيف)، (المنطقة، الكل)، (الكل، الكل)
    expanded AS (
      SELECT l.*, d.rk, d.tk
      FROM lines l
      CROSS JOIN LATERAL (VALUES (l.region, l.taxonomy), ('ALL', l.taxonomy), (l.region, 'ALL'), ('ALL', 'ALL')) AS d(rk, tk)
      WHERE d.rk IS NOT NULL
    ),
    per_store AS (
      SELECT fingerprint, rk, tk, store_id,
             sum(quantity) FILTER (WHERE cur) AS cur_units,
             sum(quantity) FILTER (WHERE NOT cur) AS prev_units,
             count(DISTINCT salla_order_id) FILTER (WHERE cur) AS cur_orders
      FROM expanded GROUP BY fingerprint, rk, tk, store_id
    ),
    agg AS (
      SELECT fingerprint, rk, tk,
             coalesce(sum(cur_units), 0)::int AS units,
             coalesce(sum(prev_units), 0)::int AS prev,
             count(*) FILTER (WHERE cur_units > 0)::int AS stores,
             count(*) FILTER (WHERE prev_units > 0)::int AS prev_stores,
             coalesce(sum(cur_orders), 0)::int AS orders,
             coalesce(max(cur_units), 0) AS top_store_units
      FROM per_store GROUP BY fingerprint, rk, tk
    ),
    eligible AS (
      SELECT a.*,
             CASE WHEN a.prev_stores >= p_min_stores AND a.prev > 0 THEN round((a.units - a.prev)::numeric / a.prev, 4) END AS growth,
             (a.units - a.prev) / sqrt(a.prev + 5.0) AS z
      FROM agg a
      WHERE a.units > 0 AND a.stores >= p_min_stores AND a.top_store_units <= p_max_share * a.units
    ),
    -- الاسم المعروض: الكتابة الأصح إملائيًا (فيها همزات وتاء مربوطة) ثم الأكثر تكرارًا
    spellings AS (
      SELECT fingerprint, name, count(*) AS c FROM lines WHERE cur GROUP BY fingerprint, name
    ),
    names AS (
      SELECT DISTINCT ON (s.fingerprint) s.fingerprint, s.name AS display_name, p.median_price
      FROM spellings s
      JOIN (SELECT fingerprint, percentile_disc(0.5) WITHIN GROUP (ORDER BY revenue_halalas / quantity) AS median_price
            FROM lines WHERE cur GROUP BY fingerprint) p USING (fingerprint)
      ORDER BY s.fingerprint, length(s.name) - length(translate(s.name, 'ةأإآى', '')) DESC, s.c DESC, s.name
    ),
    ranked AS (
      SELECT 'best'::text AS kind, e.*, row_number() OVER (PARTITION BY rk, tk ORDER BY units DESC, stores DESC, fingerprint) AS rnk, units::numeric AS score
      FROM eligible e
      UNION ALL
      SELECT 'trending', e.*, row_number() OVER (PARTITION BY rk, tk ORDER BY z DESC, units DESC, fingerprint), round(z::numeric, 4)
      FROM eligible e WHERE e.units >= p_min_units AND e.units > e.prev
    )
    INSERT INTO trend_items (run_id, kind, window_days, region, taxonomy, rank, fingerprint, display_name, units, prev_units,
                             stores_count, orders_count, growth, score, median_price_halalas)
    SELECT v_run, r.kind, w, r.rk, r.tk, r.rnk, r.fingerprint, n.display_name, r.units,
           CASE WHEN r.prev_stores >= p_min_stores THEN r.prev ELSE 0 END,
           r.stores, r.orders, r.growth, r.score, n.median_price
    FROM ranked r JOIN names n USING (fingerprint)
    WHERE r.rnk <= p_top;
  END LOOP;

  SELECT count(*) INTO v_items FROM trend_items WHERE run_id = v_run;
  UPDATE trend_runs SET finished_at = clock_timestamp(), items = v_items WHERE id = v_run;
  -- نحتفظ بأسبوعين من اللقطات لمقارنة الترتيب، وما قبلها يُحذف
  DELETE FROM trend_runs WHERE finished_at < p_as_of - interval '14 days' AND id <> v_run;
  RETURN v_run;
END $$;

REVOKE ALL ON FUNCTION trends.compute_trends(timestamptz, integer, numeric, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION trends.compute_trends(timestamptz, integer, numeric, integer, integer) TO trends_worker;

-- أحدث دفعة مكتملة
CREATE OR REPLACE VIEW latest_trend_run WITH (security_invoker = true) AS
  SELECT * FROM trend_runs WHERE finished_at IS NOT NULL ORDER BY finished_at DESC, id DESC LIMIT 1;
GRANT SELECT ON latest_trend_run TO trends_app, trends_worker;
