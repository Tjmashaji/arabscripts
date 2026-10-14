// قائمة العمليات بدون إنترنت: نقاط GPS الكثيرة لا تزيح تسجيل الحضور واعتماد المحطات.
import { test } from "node:test";
import assert from "node:assert/strict";
import { trimQueue, isGpsItem } from "../app/queue-core.ts";

const gps = (i) => ({ kind: "insert", table: "vehicle_locations", row: { i } });
const rpc = (name, i) => ({ kind: "rpc", name, args: { i } });

test("ساعتان بدون إنترنت: تبقى كل سجلات الحضور ويُقص أقدم GPS فقط", () => {
  const items = [rpc("arrive_at_stop", 0), rpc("record_attendance", 1)];
  for (let i = 0; i < 720; i++) items.push(gps(i)); // نقطة كل 10 ثوانٍ لساعتين
  items.push(rpc("record_attendance", 2));
  const out = trimQueue(items, 500, 400);
  assert.equal(out.filter((x) => !isGpsItem(x)).length, 3);
  const kept = out.filter(isGpsItem);
  assert.equal(kept.length, 500);
  assert.equal(kept[0].row.i, 220); // الأقدم حُذف
  assert.deepEqual(out.filter((x) => !isGpsItem(x)).map((x) => x.args.i), [0, 1, 2]); // الترتيب محفوظ
});

test("لا يتغير شيء تحت الحد", () => {
  const items = [rpc("record_attendance", 1), gps(1), gps(2)];
  assert.equal(trimQueue(items), items);
});

test("حد العمليات المهمة يقص الأقدم منها فقط", () => {
  const items = [rpc("a", 1), gps(1), rpc("b", 2), rpc("c", 3)];
  assert.deepEqual(trimQueue(items, 10, 2).map((x) => x.kind === "rpc" ? x.name : "gps"), ["gps", "b", "c"]);
});
