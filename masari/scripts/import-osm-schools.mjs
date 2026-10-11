#!/usr/bin/env node
// استيراد المدارس من OpenStreetMap إلى دليل مساري (حالة «غير مفعّلة»).
// البيانات © OpenStreetMap contributors — رخصة ODbL: يجب ذكر المصدر حيث تُعرض.
//
// الاستخدام:
//   node scripts/import-osm-schools.mjs                      # يجلب ويطبع ملخصًا (بدون حفظ)
//   node scripts/import-osm-schools.mjs --sql > import.sql   # يطبع أمر SQL يمكن تشغيله في SQL Editor
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/import-osm-schools.mjs --apply
// خيارات: --relation <OSM relation id> (الافتراضي 12423676 = محافظة الخرج)، --city <اسم المدينة>، --input <ملف JSON محفوظ من Overpass>
// إعادة التشغيل آمنة: التحديث يتم على (source='osm', external_id='node/123') دون تكرار.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const relation = Number(arg("relation", "12423676"));
const city = arg("city", "الخرج");
const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const NOT_SCHOOL = /جامعة|كلية|معهد عالي|university|college/i;

async function fetchOverpass() {
  const query = `[out:json][timeout:120];area(${3600000000 + relation})->.a;(nwr["amenity"~"^(school|kindergarten)$"](area.a););out center tags;`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, { method: "POST", body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(150000) });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith("{")) return JSON.parse(text);
      console.error(`… ${endpoint} → ${res.status}`);
    } catch (e) { console.error(`… ${endpoint} → ${e.message}`); }
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
  }
  throw new Error("Overpass غير متاح الآن. أعد المحاولة لاحقًا.");
}

const data = arg("input") ? JSON.parse(readFileSync(arg("input"), "utf8")) : await fetchOverpass();
const elements = data.elements ?? [];
const rows = [];
let unnamed = 0, excluded = 0;
for (const e of elements) {
  const t = e.tags ?? {};
  const name = (t["name:ar"] || t.name || "").trim();
  if (!name) { unnamed++; continue; }
  if (NOT_SCHOOL.test(name)) { excluded++; continue; }
  const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
  if (lat == null || lng == null) continue;
  rows.push({
    name, lat, lng, city,
    district: t["addr:suburb"] || t["addr:neighbourhood"] || t["addr:district"] || null,
    ministry_code: t["ref:moe"] || null,
    external_id: `${e.type}/${e.id}`,
  });
}
console.error(`OSM: ${elements.length} عنصر · بأسماء صالحة: ${rows.length} · بلا اسم: ${unnamed} · مستبعد (جامعات/كليات): ${excluded}`);

if (args.includes("--sql")) {
  const payload = JSON.stringify(rows).replace(/'/g, "''");
  console.log(`select public.admin_import_schools('${payload}'::jsonb, 'osm');`);
} else if (args.includes("--apply")) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("حدد SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY في البيئة.");
  const res = await fetch(`${url}/rest/v1/rpc/admin_import_schools`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_rows: rows, p_source: "osm" }),
  });
  console.log(res.status, await res.text());
} else {
  for (const r of rows) console.log(`- ${r.name} (${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}) ${r.external_id}`);
}
