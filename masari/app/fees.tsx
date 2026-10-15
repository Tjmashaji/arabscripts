"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Download, Receipt, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { downloadCsv } from "./reports";

// رسوم النقل: المدرسة تصدر الفواتير لأولياء الأمور وتتابع السداد، وولي الأمر يبلّغ عن التحويل.

type Fee = { id: string; number: string; title: string; note?: string | null; amount: number; vat_rate: number; total: number; due_date: string; status: string; payment_ref: string | null; paid_at: string | null; created_at: string; student_id: string; students: { full_name: string; grade: string | null } | null };
const feeStatus: Record<string, [string, string]> = { unpaid: ["غير مدفوعة", "tone-1"], claimed: ["بانتظار تأكيد المدرسة", "tone-1"], paid: ["مدفوعة", "tone-0"], cancelled: ["ملغاة", "tone-2"] };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const sar = (n: number) => `${Number(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const overdue = (f: Fee) => f.status === "unpaid" && f.due_date < today();
const one = <T,>(v: T | T[] | null): T | null => Array.isArray(v) ? v[0] ?? null : v;
const feeErr = (m: string) => m.includes("INVALID_DATE") ? "تاريخ الاستحقاق يجب أن يكون اليوم أو بعده." : m.includes("INVALID_AMOUNT") ? "اكتب مبلغًا صحيحًا." : m.includes("FORBIDDEN") ? "هذا الإجراء لمدير المدرسة فقط." : m.includes("REF_REQUIRED") ? "اكتب مرجع التحويل." : "تعذر تنفيذ الطلب. حاول مرة أخرى.";

export function SchoolFees({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const [rows, setRows] = useState<Fee[]>([]);
  const [filter, setFilter] = useState("");
  const [f, setF] = useState({ title: "رسوم النقل — الفصل الدراسي الأول", amount: "", due: today(), vat: false, note: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("fee_invoices").select("id,number,title,amount,vat_rate,total,due_date,status,payment_ref,paid_at,created_at,student_id,students(full_name,grade)").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(1000);
    setRows(((data ?? []) as unknown as Fee[]).map((r) => ({ ...r, students: one(r.students) })));
  }, [schoolId]);
  useEffect(() => { let alive = true; void (async () => { if (alive) await load().catch(() => {}); })(); return () => { alive = false; }; }, [load]);
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true); setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setMsg({ ok: false, text: feeErr(error.message) }); return false; }
    setMsg({ ok: true, text: ok }); await load(); return true;
  };
  const issue = async () => {
    const amount = Number(f.amount);
    if (!window.confirm(`إصدار «${f.title}» بمبلغ ${amount} ر.س${f.vat ? " + الضريبة" : ""} لكل الطلاب المشتركين؟`)) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("school_issue_fees", { p_school: schoolId, p_title: f.title.trim(), p_amount: amount, p_due: f.due, p_vat_rate: f.vat ? 0.15 : 0, p_students: null, p_note: f.note.trim() || null });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: feeErr(error.message) }); return; }
    setMsg({ ok: true, text: `أُصدرت ${data} فاتورة، ووصل إشعار لأولياء الأمور.` }); setF({ ...f, amount: "", note: "" }); await load();
  };
  const shown = useMemo(() => rows.filter((r) => !filter || (filter === "overdue" ? overdue(r) : r.status === filter)), [rows, filter]);
  const sum = (st: string) => rows.filter((r) => r.status === st).reduce((a, r) => a + Number(r.total), 0);
  const exportIt = () => downloadCsv(`مساري-رسوم-${schoolName}-${today()}`, [{ title: `رسوم النقل — ${schoolName}`, head: ["رقم الفاتورة", "الطالب", "الصف", "البيان", "المبلغ", "الضريبة", "الإجمالي", "الاستحقاق", "الحالة", "مرجع السداد", "تاريخ السداد"],
    rows: rows.map((r) => [r.number, r.students?.full_name ?? "", r.students?.grade ?? "", r.title, r.amount, Number(r.total) - Number(r.amount), r.total, r.due_date, feeStatus[r.status]?.[0] ?? r.status, r.payment_ref, r.paid_at?.slice(0, 10) ?? ""]) }]);
  return <>
    <div className="welcome"><div><p className="eyebrow">إدارة المدرسة</p><h1>رسوم النقل</h1><p>أصدر فواتير النقل لأولياء الأمور وتابع السداد. التذكير يُرسل تلقائيًا قبل الاستحقاق وبعد التأخر.</p></div>
      <Button variant="outline" disabled={!rows.length} onClick={exportIt}><Download /> تصدير Excel</Button></div>
    {msg && <p className={`save-strip ops-message ${msg.ok ? "" : "ops-error"}`}>{msg.ok ? <Check /> : <X />}<span>{msg.text}</span></p>}
    <section className="report-tiles">
      <div className="report-tile good"><span>المحصّل</span><strong>{sar(sum("paid"))}</strong></div>
      <div className="report-tile warn"><span>بانتظار التأكيد</span><strong>{sar(sum("claimed"))}</strong></div>
      <div className="report-tile"><span>غير مدفوع</span><strong>{sar(sum("unpaid"))}</strong></div>
      <div className="report-tile bad"><span>متأخرة</span><strong>{rows.filter(overdue).length}</strong></div>
    </section>
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">إصدار</p><h2>فاتورة لكل الطلاب المشتركين</h2></div><Receipt className="title-icon" /></div>
      <div className="claim-grid">
        <label htmlFor="fee-title">البيان<input id="fee-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} /></label>
        <label htmlFor="fee-amount">المبلغ (ر.س)<input id="fee-amount" type="number" min="1" step="0.01" dir="ltr" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        <label htmlFor="fee-due">تاريخ الاستحقاق<input id="fee-due" type="date" min={today()} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></label>
        <label htmlFor="fee-note">ملاحظة (طريقة الدفع، رقم الآيبان…)<input id="fee-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} /></label>
      </div>
      <label className="consent-check" htmlFor="fee-vat"><input id="fee-vat" type="checkbox" checked={f.vat} onChange={(e) => setF({ ...f, vat: e.target.checked })} /> إضافة ضريبة القيمة المضافة 15% (للمدارس المسجلة في الضريبة)</label>
      <div className="ops-actions"><Button disabled={busy || f.title.trim().length < 3 || !(Number(f.amount) > 0) || !f.due} onClick={() => void issue()}><Receipt /> إصدار الفواتير</Button></div>
    </article>
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">الفواتير</p><h2>{shown.length} فاتورة</h2></div>
        <select className="sub-driver" aria-label="تصفية الفواتير" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">الكل</option><option value="claimed">بانتظار التأكيد</option><option value="unpaid">غير مدفوعة</option><option value="overdue">متأخرة</option><option value="paid">مدفوعة</option><option value="cancelled">ملغاة</option></select></div>
      {shown.length === 0 && <p className="muted-label">لا توجد فواتير.</p>}
      {shown.slice(0, 300).map((r) => <div className="ops-row" key={r.id}>
        <div><strong>{r.students?.full_name ?? "—"}</strong><p>{r.title} · {sar(r.total)} · تستحق {r.due_date}{r.payment_ref ? ` · مرجع ${r.payment_ref}` : ""} · <span dir="ltr">{r.number}</span></p></div>
        <div className="ops-actions">
          <Badge className={`status-badge ${overdue(r) ? "tone-2" : feeStatus[r.status]?.[1] ?? "tone-1"}`}>{overdue(r) ? "متأخرة" : feeStatus[r.status]?.[0] ?? r.status}</Badge>
          {(r.status === "unpaid" || r.status === "claimed") && <Button size="sm" disabled={busy} onClick={() => void run(() => supabase.rpc("school_set_fee_status", { p_invoice: r.id, p_status: "paid", p_ref: null }), `تم تأكيد سداد ${r.students?.full_name}.`)}><Check /> تأكيد السداد</Button>}
          {r.status === "claimed" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => supabase.rpc("school_set_fee_status", { p_invoice: r.id, p_status: "unpaid", p_ref: null }), "أُعيدت الفاتورة غير مدفوعة وأُبلغ ولي الأمر.")}>لم يصل التحويل</Button>}
          {r.status === "unpaid" && <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (window.confirm("إلغاء هذه الفاتورة؟")) void run(() => supabase.rpc("school_set_fee_status", { p_invoice: r.id, p_status: "cancelled", p_ref: null }), "أُلغيت الفاتورة."); }}>إلغاء</Button>}
        </div>
      </div>)}
    </article>
  </>;
}

export function ParentFees() {
  const [rows, setRows] = useState<Fee[] | null>(null);
  const [refFor, setRefFor] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("fee_invoices").select("id,number,title,note,amount,vat_rate,total,due_date,status,payment_ref,paid_at,created_at,student_id,students(full_name,grade)").neq("status", "cancelled").order("due_date", { ascending: false });
    setRows(((data ?? []) as unknown as Fee[]).map((r) => ({ ...r, students: one(r.students) })));
  }, []);
  useEffect(() => { let alive = true; void (async () => { if (alive) await load().catch(() => setRows([])); })(); return () => { alive = false; }; }, [load]);
  const claim = async (id: string) => {
    const { error } = await supabase.rpc("guardian_claim_fee_paid", { p_invoice: id, p_ref: ref.trim() });
    if (error) { setMsg({ ok: false, text: feeErr(error.message) }); return; }
    setMsg({ ok: true, text: "أبلغنا المدرسة بالسداد، وسيصلك إشعار عند التأكيد." }); setRefFor(null); setRef(""); await load();
  };
  const due = (rows ?? []).filter((r) => r.status === "unpaid").reduce((a, r) => a + Number(r.total), 0);
  return <>
    <div className="welcome"><div><p className="eyebrow">ولي الأمر</p><h1>فواتير النقل</h1><p>فواتير رسوم النقل من المدرسة. بعد التحويل أدخل رقم المرجع لتؤكده المدرسة.</p></div></div>
    {msg && <p className={`save-strip ops-message ${msg.ok ? "" : "ops-error"}`}>{msg.ok ? <Check /> : <X />}<span>{msg.text}</span></p>}
    {rows && rows.length > 0 && <section className="report-tiles"><div className={`report-tile ${due ? "warn" : "good"}`}><span>المستحق عليك</span><strong>{sar(due)}</strong></div></section>}
    <article className="panel ops-panel">
      {rows?.length === 0 && <p className="muted-label">لا توجد فواتير.</p>}
      {rows?.map((r) => <div key={r.id}>
        <div className="ops-row"><div><strong>{r.title}</strong><p>{r.students?.full_name} · {sar(r.total)}{Number(r.total) > Number(r.amount) ? " شامل الضريبة" : ""} · تستحق {r.due_date} · <span dir="ltr">{r.number}</span></p>{r.note && r.status !== "paid" && <p className="pay-note"><strong>طريقة الدفع:</strong> <bdi>{r.note}</bdi></p>}</div>
          <div className="ops-actions"><Badge className={`status-badge ${overdue(r) ? "tone-2" : feeStatus[r.status]?.[1] ?? "tone-1"}`}>{overdue(r) ? "متأخرة" : feeStatus[r.status]?.[0]}</Badge>
            {r.status === "unpaid" && <Button size="sm" onClick={() => { setRefFor(r.id); setRef(""); setMsg(null); }}>دفعت</Button>}</div></div>
        {refFor === r.id && <div className="inline-form"><label htmlFor={`ref-${r.id}`}>رقم مرجع التحويل</label><input id={`ref-${r.id}`} dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} />
          <Button size="sm" disabled={!ref.trim()} onClick={() => void claim(r.id)}>إرسال</Button><Button size="sm" variant="outline" onClick={() => setRefFor(null)}>إلغاء</Button></div>}
      </div>)}
    </article>
  </>;
}
