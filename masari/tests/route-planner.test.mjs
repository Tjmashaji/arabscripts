// اختبارات وحدة لاقتراح المسارات: node --experimental-strip-types --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterStops, distM, orderStops, suggestRoutes } from "../app/route-planner.ts";

const school = { lat: 24.15, lng: 47.31 };
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const students = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, name: `طالب ${i}`, lat: 24.15 + (rnd() - 0.5) * 0.06, lng: 47.31 + (rnd() - 0.5) * 0.06 }));

test("المسافة بين نقطتين معروفتين", () => {
  const d = distM({ lat: 24.15, lng: 47.31 }, { lat: 24.16, lng: 47.31 });
  assert.ok(Math.abs(d - 1112) < 5, `expected ~1112m, got ${d}`);
});

test("البيوت المتقاربة تصبح محطة واحدة", () => {
  const stops = clusterStops([{ id: "a", name: "سعد", lat: 24.15, lng: 47.30 }, { id: "b", name: "نورة", lat: 24.1505, lng: 47.30 }, { id: "c", name: "فهد", lat: 24.17, lng: 47.30 }], 250);
  assert.equal(stops.length, 2);
  assert.equal(stops[0].students.length, 2);
  assert.equal(stops[0].label, "محطة سعد ونورة");
});

test("كل طالب يُسند مرة واحدة ولا يتجاوز أي مسار سعة الباص", () => {
  for (const cap of [5, 12, 30, 100]) {
    const routes = suggestRoutes(students, school, cap);
    const ids = routes.flatMap((r) => r.stops.flatMap((s) => s.students.map((x) => x.id)));
    assert.equal(ids.length, students.length, `cap ${cap}`);
    assert.equal(new Set(ids).size, students.length, `cap ${cap}: duplicate assignment`);
    assert.ok(routes.every((r) => r.students <= cap), `cap ${cap}: route over capacity`);
    assert.ok(routes.length >= Math.ceil(students.length / cap), `cap ${cap}: too few buses`);
  }
});

test("محطة أكبر من سعة الباص تُقسم على باصين", () => {
  const crowd = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, name: `ط ${i}`, lat: 24.16, lng: 47.30 }));
  const routes = suggestRoutes(crowd, school, 5);
  assert.deepEqual(routes.map((r) => r.students).sort(), [2, 5]);
});

test("ترتيب المحطات يبدأ من الأبعد عن المدرسة ولا يطول عن الترتيب العشوائي", () => {
  const stops = clusterStops(students.slice(0, 12), 1);
  const ordered = orderStops(stops, school);
  const far = Math.max(...stops.map((s) => distM(s, school)));
  const len = (arr) => arr.reduce((a, s, i) => a + distM(s, i + 1 < arr.length ? arr[i + 1] : school), 0);
  assert.ok(len(ordered) <= len(stops) + 1);
  assert.ok(distM(ordered[0], school) >= far * 0.5);
});

test("لا طلاب = لا مسارات", () => {
  assert.deepEqual(suggestRoutes([], school, 30), []);
});
