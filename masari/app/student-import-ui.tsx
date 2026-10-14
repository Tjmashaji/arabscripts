"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { importErrorText, parseCsv, templateCsv, toImportRows, type ImportRow } from "./student-import";

// استيراد الطلاب دفعة واحدة من ملف Excel محفوظ بصيغة CSV: معاينة ثم اعتماد، وكل صف خاطئ يُذكر برقم سطره.
// الخادم (import_students) يتحقق من كل صف ويعتمده بنفس مسار طلبات التسجيل، ويُربط ولي الأمر ببريده.

const CHUNK = 200;
type Failure = { line: number; name: string; error: string };

export function StudentImport({ schoolId, onDone }: { schoolId: string; onDone: (text: string, ok: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<{ name: string; rows: ImportRow[]; unknown: string[] } | null>(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<Failure[]>([]);

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "masari-students-template.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const read = async (f: File | undefined) => {
    setFile(null); setProblem(""); setFailures([]);
    if (!f) return;
    if (/\.xlsx?$/i.test(f.name)) { setProblem("احفظ الملف من Excel بصيغة CSV UTF-8 (ملف ← حفظ باسم) ثم اختره هنا."); return; }
    if (f.size > 2_000_000) { setProblem("الملف كبير جدًا. قسّمه إلى ملفات أصغر من 1000 طالب."); return; }
    const parsed = toImportRows(parseCsv(await f.text()));
    if (parsed.missingName) { setProblem("لم نجد عمود «اسم الطالب». استخدم القالب أو أضف العنوان في أول سطر."); return; }
    if (!parsed.rows.length) { setProblem("الملف لا يحتوي طلابًا."); return; }
    if (parsed.rows.length > 1000) { setProblem(`الملف فيه ${parsed.rows.length} طالبًا؛ الحد 1000 في المرة. قسّمه إلى ملفين.`); return; }
    setFile({ name: f.name, rows: parsed.rows, unknown: parsed.unknownHeaders });
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    let created = 0; const failed: Failure[] = [];
    try {
      for (let start = 0; start < file.rows.length; start += CHUNK) {
        const chunk = file.rows.slice(start, start + CHUNK);
        const { data, error } = await supabase.rpc("import_students", { p_school: schoolId, p_rows: chunk });
        if (error) {
          chunk.forEach((r, i) => failed.push({ line: start + i + 2, name: r.name, error: error.message?.includes("FORBIDDEN") ? "ليست لديك صلاحية" : "تعذر الحفظ" }));
          continue;
        }
        const res = data as { created: number; errors: { row: number; name: string; error: string }[] };
        created += res.created;
        // رقم السطر في الملف: سطر العناوين أولًا
        res.errors.forEach((e) => failed.push({ line: start + e.row + 1, name: e.name, error: importErrorText[e.error] ?? e.error }));
      }
    } finally { setBusy(false); }
    setFailures(failed);
    if (!failed.length) setFile(null);
    onDone(failed.length ? `أُضيف ${created} طالبًا، وتعذر ${failed.length} (التفاصيل أسفل الاستيراد).` : `أُضيف ${created} طالبًا وأولياء أمورهم. يُربط حساب ولي الأمر عند تسجيله بنفس البريد.`, failed.length === 0);
  };

  return <article className="panel ops-panel student-import">
    <div className="panel-head"><div><p className="eyebrow">دفعة واحدة</p><h2>استيراد الطلاب من ملف</h2></div>
      <Button size="sm" variant={open ? "default" : "outline"} onClick={() => setOpen(!open)}><Upload /> {open ? "إغلاق" : "استيراد ملف"}</Button></div>
    {open && <>
      <p className="muted-label">جهّز الطلاب في Excel بنفس أعمدة القالب، ثم احفظه بصيغة CSV UTF-8. يُعتمد كل طالب مباشرة، ويُنشأ سجل ولي أمره ويُربط ببريده.</p>
      <div className="ops-actions">
        <Button size="sm" variant="outline" onClick={downloadTemplate}><Download /> تنزيل القالب</Button>
        <label className="import-file"><span>اختر ملف CSV</span><input type="file" accept=".csv,.txt,text/csv" disabled={busy} onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>
      {problem && <p className="save-strip ops-message ops-error"><span>{problem}</span></p>}
      {file && <>
        <p className="ops-subhead"><strong>{file.name}</strong>: {file.rows.length} طالب{file.unknown.length > 0 && <span className="muted-label"> · أعمدة تُتجاهل: {file.unknown.join("، ")}</span>}</p>
        <div className="table-wrap"><table className="report-table"><thead><tr><th>#</th><th>الطالب</th><th>الصف</th><th>ولي الأمر</th><th>الجوال</th><th>البريد</th><th>الموقع</th></tr></thead>
          <tbody>{file.rows.slice(0, 20).map((r, i) => <tr key={i}><td>{i + 2}</td><td>{r.name || "—"}</td><td>{[r.grade, r.class_name].filter(Boolean).join(" · ") || "—"}</td><td>{r.parent_name ?? "—"}</td><td dir="ltr">{r.parent_phone ?? "—"}</td><td dir="ltr">{r.parent_email ?? "—"}</td><td>{r.lat ? "✓" : "—"}</td></tr>)}</tbody></table></div>
        {file.rows.length > 20 && <p className="muted-label">و{file.rows.length - 20} طالبًا آخر.</p>}
        <Button className="wide-action" disabled={busy} onClick={() => void run()}>{busy ? "جارٍ الاستيراد…" : `استيراد ${file.rows.length} طالب واعتمادهم`}</Button>
      </>}
      {failures.length > 0 && <div className="import-failures"><h3>لم يُستورد ({failures.length})</h3>
        <ul>{failures.map((f) => <li key={f.line}>سطر {f.line}{f.name ? ` (${f.name})` : ""}: {f.error}</li>)}</ul>
        <p className="muted-label">صحّح هذه الأسطر في الملف واستورده مرة أخرى؛ الطلاب المسجلون مسبقًا يُتخطَّون ولا يتكررون.</p></div>}
    </>}
  </article>;
}
