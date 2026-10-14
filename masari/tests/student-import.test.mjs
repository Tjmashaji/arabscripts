// ملف استيراد الطلاب: عناوين عربية وإنجليزية، علامات التنصيص، الأرقام الهندية، والصفر الذي يحذفه Excel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, toImportRows, templateCsv, TEMPLATE_HEADERS } from "../app/student-import.ts";

test("القالب يُقرأ كما هو", () => {
  const { rows, unknownHeaders, missingName } = toImportRows(parseCsv(templateCsv()));
  assert.equal(missingName, false);
  assert.deepEqual(unknownHeaders, []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "محمد أحمد العتيبي");
  assert.equal(rows[0].lat, "24.7501");
  assert.equal(rows[0].lng, "46.8001");
  assert.equal(rows[0].class_name, "3/أ");
  assert.equal(TEMPLATE_HEADERS.length, 11);
});

test("تنصيص وفواصل داخل الخلية وسطور ويندوز", () => {
  const t = parseCsv('name,address\r\n"سعد, الابن","حي ""النسيم"""\r\n\r\nفهد,\r\n');
  assert.deepEqual(t, [["name", "address"], ["سعد, الابن", 'حي "النسيم"'], ["فهد", ""]]);
});

test("فاصلة منقوطة وTab (نسخ من جدول)", () => {
  assert.deepEqual(parseCsv("الاسم;الصف\nعلي;الأول"), [["الاسم", "الصف"], ["علي", "الأول"]]);
  assert.deepEqual(parseCsv("الاسم\tالصف\nعلي\tالأول"), [["الاسم", "الصف"], ["علي", "الأول"]]);
});

test("أرقام هندية وصفر محذوف وعمود غير معروف", () => {
  const { rows, unknownHeaders } = toImportRows([["اسم الطالب", "جوال ولي الأمر", "الموقع", "ملاحظات"], ["علي", "٥٠٠٠٠٠٠٠٠", "٢٤٫١٥، ٤٧٫٣١", "x"]]);
  assert.equal(rows[0].parent_phone, "0500000000");
  assert.equal(rows[0].lat, "24.15");
  assert.equal(rows[0].lng, "47.31");
  assert.deepEqual(unknownHeaders, ["ملاحظات"]);
});

test("بلا عمود اسم", () => {
  assert.equal(toImportRows([["الصف"], ["الأول"]]).missingName, true);
});
