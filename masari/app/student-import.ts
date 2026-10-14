// قراءة ملف الطلاب (CSV من Excel أو Google Sheets) وتحويله لصفوف دالة import_students.
// بلا اعتماد على المتصفح أو Supabase (يُختبر في tests/student-import.test.mjs).

export type ImportRow = {
  name: string; grade?: string; class_name?: string; parent_name?: string; parent_phone?: string; parent_email?: string;
  home_address?: string; lat?: string; lng?: string; national_id?: string; emergency_name?: string; emergency_phone?: string;
};
type Field = keyof ImportRow | "location";

// عناوين الأعمدة المقبولة بالعربي والإنجليزي (بعد التطبيع)
const ALIASES: Record<string, Field> = {};
const alias = (field: Field, ...names: string[]) => names.forEach((n) => { ALIASES[norm(n)] = field; });
function norm(s: string) { return s.replace(/^﻿/, "").replace(/[\s_\-ـ*]+/g, "").toLowerCase(); }
alias("name", "اسم الطالب", "الاسم", "الطالب", "name", "student name", "student_name");
alias("grade", "الصف", "المرحلة", "grade");
alias("class_name", "الفصل", "الشعبة", "class", "class_name");
alias("parent_name", "اسم ولي الأمر", "ولي الأمر", "parent name", "parent_name");
alias("parent_phone", "جوال ولي الأمر", "الجوال", "رقم الجوال", "phone", "parent phone", "parent_phone");
alias("parent_email", "بريد ولي الأمر", "البريد", "البريد الإلكتروني", "email", "parent email", "parent_email");
alias("home_address", "عنوان المنزل", "العنوان", "الحي", "address", "home_address");
alias("location", "الموقع", "موقع المنزل", "الإحداثيات", "location", "coordinates");
alias("lat", "خط العرض", "lat", "latitude");
alias("lng", "خط الطول", "lng", "lon", "longitude");
alias("national_id", "رقم الهوية", "الهوية", "السجل المدني", "national id", "national_id");
alias("emergency_name", "اسم جهة الطوارئ", "جهة الطوارئ", "emergency name", "emergency_name");
alias("emergency_phone", "جوال الطوارئ", "رقم الطوارئ", "emergency phone", "emergency_phone");

export const TEMPLATE_HEADERS = ["اسم الطالب", "الصف", "الفصل", "اسم ولي الأمر", "جوال ولي الأمر", "بريد ولي الأمر", "عنوان المنزل", "الموقع", "رقم الهوية", "اسم جهة الطوارئ", "جوال الطوارئ"];
export const TEMPLATE_EXAMPLE = ["محمد أحمد العتيبي", "الثالث الابتدائي", "3/أ", "أحمد العتيبي", "0500000000", "parent@example.com", "حي النسيم", "24.7501, 46.8001", "", "خالد العتيبي", "0550000000"];

/** ملف القالب: BOM حتى يفتحه Excel بالعربي سليمًا. */
export const templateCsv = () => "﻿" + [TEMPLATE_HEADERS, TEMPLATE_EXAMPLE].map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n";
function quote(v: string) { return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }

// الأرقام الهندية (٠-٩) والفارسية إلى لاتينية
const latinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0)).replace(/٫/g, ".");

/** CSV بسيط يدعم علامات التنصيص والفاصلة أو الفاصلة المنقوطة أو Tab (نسخ من جدول). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = count("\t") > count(",") && count("\t") >= count(";") ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ""));
}

export type ParsedFile = { rows: ImportRow[]; unknownHeaders: string[]; missingName: boolean };

export function toImportRows(table: string[][]): ParsedFile {
  const [header = [], ...body] = table;
  const fields = header.map((h) => ALIASES[norm(h)] ?? null);
  const unknownHeaders = header.filter((h, i) => h && !fields[i]);
  if (!fields.includes("name")) return { rows: [], unknownHeaders, missingName: true };
  const rows = body.map((cells) => {
    const r: ImportRow = { name: "" };
    fields.forEach((f, i) => {
      const v = (cells[i] ?? "").trim();
      if (!f || !v) return;
      if (f === "location") {
        const parts = latinDigits(v).split(/[,،\s]+/).filter(Boolean);
        if (parts.length === 2) { r.lat = parts[0]; r.lng = parts[1]; } else { r.lat = v; } // صيغة خاطئة: يرفضها الخادم بسببها
      } else if (f === "parent_phone" || f === "emergency_phone" || f === "national_id" || f === "lat" || f === "lng") {
        r[f] = latinDigits(v).replace(/[\s-]/g, "");
      } else r[f] = v;
    });
    if (r.parent_phone && /^5\d{8}$/.test(r.parent_phone)) r.parent_phone = "0" + r.parent_phone; // Excel يحذف الصفر الأول
    if (r.emergency_phone && /^5\d{8}$/.test(r.emergency_phone)) r.emergency_phone = "0" + r.emergency_phone;
    return r;
  });
  return { rows, unknownHeaders, missingName: false };
}

export const importErrorText: Record<string, string> = {
  NAME_REQUIRED: "اسم الطالب ناقص (3 أحرف على الأقل)",
  INVALID_EMAIL: "بريد ولي الأمر غير صحيح",
  INVALID_LOCATION: "الموقع غير صحيح؛ اكتبه هكذا: 24.7501, 46.8001",
  DUPLICATE_STUDENT: "الطالب مسجل مسبقًا",
  INVALID_ROW: "بيانات الصف غير صالحة",
};
