"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, FileText, Printer, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

// اشتراك المدارس في مساري: باقات، اشتراك لكل مدرسة، وفواتير بضريبة القيمة المضافة 15%.
// مدير النظام يدير الباقات ويصدر الفواتير ويسجل الدفع، والمدرسة ترى باقتها واستخدامها وفواتيرها.

type Msg = { text: string; ok: boolean } | null;
const Flash = ({ msg }: { msg: Msg }) => msg && <p className={`save-strip ops-message ${msg.ok ? "" : "ops-error"}`}>{msg.ok ? <Check /> : <X />}<span>{msg.text}</span></p>;
const sar = (n: number | string | null | undefined) => `${Number(n ?? 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const subStatus: Record<string, [string, string]> = { trial: ["تجريبي", "tone-2"], active: ["نشط", "tone-0"], past_due: ["متأخر السداد", "tone-1"], cancelled: ["ملغى", "tone-1"] };
const invStatus: Record<string, [string, string]> = { issued: ["مستحقة", "tone-1"], paid: ["مدفوعة", "tone-0"], void: ["ملغاة", "tone-2"] };
const periodText: Record<string, string> = { monthly: "شهري", term: "فصلي", yearly: "سنوي" };
const errText = (m: string) => m.includes("PERIOD_ALREADY_INVOICED") ? "هذه الفترة مفوترة مسبقًا." : m.includes("NO_SUBSCRIPTION") ? "حدد باقة للمدرسة أولًا." : m.includes("FORBIDDEN") ? "هذا الإجراء غير مسموح لحسابك." : "تعذر تنفيذ الطلب.";
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA"); };
const monthEnd = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString("en-CA"); };

type Plan = { id: string; name: string; monthly_price: number; max_buses: number | null; max_students: number | null; description: string | null; is_active: boolean };
type Invoice = { id: string; number: string; school_id: string; plan_name: string; period_start: string; period_end: string; months: number; amount: number; vat: number; total: number; status: string; due_date: string; paid_at: string | null; payment_ref: string | null; created_at: string };

// ───────── فاتورة قابلة للطباعة ─────────
function InvoiceView({ inv, schoolName, onClose }: { inv: Invoice; schoolName: string; onClose: () => void }) {
  return <div className="cards-sheet-overlay">
    <div className="cards-sheet-bar no-print"><strong>فاتورة {inv.number}</strong><div className="ops-actions"><Button onClick={() => window.print()}><Printer /> طباعة</Button><Button variant="outline" onClick={onClose}><X /> إغلاق</Button></div></div>
    <article className="invoice print-area" dir="rtl">
      <header><div><h2>فاتورة اشتراك</h2><p>مساري — منصة النقل المدرسي</p></div><div className="inv-meta"><span>رقم الفاتورة <b dir="ltr">{inv.number}</b></span><span>تاريخ الإصدار {inv.created_at.slice(0, 10)}</span><span>تاريخ الاستحقاق {inv.due_date}</span></div></header>
      <p><b>العميل:</b> {schoolName}</p>
      <table><thead><tr><th>البيان</th><th>الفترة</th><th>الأشهر</th><th>المبلغ</th></tr></thead>
        <tbody><tr><td>اشتراك مساري — باقة {inv.plan_name}</td><td>{inv.period_start} إلى {inv.period_end}</td><td>{inv.months}</td><td>{sar(inv.amount)}</td></tr></tbody>
        <tfoot><tr><td colSpan={3}>ضريبة القيمة المضافة 15%</td><td>{sar(inv.vat)}</td></tr><tr><td colSpan={3}><b>الإجمالي</b></td><td><b>{sar(inv.total)}</b></td></tr></tfoot></table>
      <p className="inv-status">الحالة: {invStatus[inv.status]?.[0] ?? inv.status}{inv.paid_at ? ` · دُفعت ${inv.paid_at.slice(0, 10)}` : ""}{inv.payment_ref ? ` · مرجع ${inv.payment_ref}` : ""}</p>
    </article>
  </div>;
}

// ───────── صفحة المدرسة: اشتراك مساري ─────────
type SchoolBillingData = { subscription: { plan_name: string; status: string; billing_period: string; monthly_price: number; starts_on: string; ends_on: string | null; max_buses: number | null; max_students: number | null } | null; buses: number; students: number; open_total: number };

export function SchoolBilling({ schoolId, schoolName }: { schoolId: string; schoolName: string }) {
  const [data, setData] = useState<SchoolBillingData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [view, setView] = useState<Invoice | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [b, inv] = await Promise.all([supabase.rpc("my_school_billing", { p_school: schoolId }), supabase.from("masari_invoices").select("*").eq("school_id", schoolId).order("period_start", { ascending: false }).limit(50)]);
      if (!alive) return;
      setData((b.data ?? null) as SchoolBillingData | null); setInvoices((inv.data ?? []) as Invoice[]);
    })().catch(() => {});
    return () => { alive = false; };
  }, [schoolId]);
  if (view) return <InvoiceView inv={view} schoolName={schoolName} onClose={() => setView(null)} />;
  const sub = data?.subscription;
  const usage = (used: number, max: number | null, label: string) => <div className="usage"><div className="usage-head"><span>{label}</span><b>{used}{max ? ` من ${max}` : " · بلا حد"}</b></div>{max && <div className="usage-bar"><span className={used > max ? "over" : ""} style={{ width: `${Math.min(100, (used / max) * 100)}%` }} /></div>}</div>;
  return <>
    <div className="welcome"><div><p className="eyebrow">إدارة المدرسة</p><h1>اشتراك مساري</h1><p>باقة مدرستك واستخدامها والفواتير.</p></div></div>
    <article className="panel ops-panel">
      {!data ? <p className="muted-label">جارٍ التحميل…</p> : !sub ? <p className="muted-label">لم تُحدَّد باقة لمدرستك بعد. يتواصل معك فريق مساري لاختيار الباقة المناسبة.</p> : <>
        <div className="panel-head"><div><p className="eyebrow">الباقة الحالية</p><h2>{sub.plan_name} · {sar(sub.monthly_price)} شهريًا</h2></div><Badge className={`status-badge ${subStatus[sub.status]?.[1]}`}>{subStatus[sub.status]?.[0] ?? sub.status}</Badge></div>
        <p className="muted-label">الفوترة {periodText[sub.billing_period] ?? sub.billing_period} · من {sub.starts_on}{sub.ends_on ? ` إلى ${sub.ends_on}` : ""}{Number(data.open_total) > 0 ? ` · المستحق الآن ${sar(data.open_total)}` : ""}</p>
        {usage(Number(data.buses), sub.max_buses, "الباصات النشطة")}
        {usage(Number(data.students), sub.max_students, "الطلاب المشتركون")}
        {((sub.max_buses && data.buses > sub.max_buses) || (sub.max_students && data.students > sub.max_students)) && <p className="save-strip ops-message ops-error"><X /><span>تجاوزت حدود باقتك. تواصل مع مساري للترقية.</span></p>}
      </>}
    </article>
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">الفواتير</p><h2>فواتير اشتراك مساري</h2></div><FileText className="title-icon" /></div>
      {invoices.length === 0 && <p className="muted-label">لا توجد فواتير بعد.</p>}
      {invoices.map((i) => <div className="ops-row" key={i.id}><div><strong dir="ltr">{i.number}</strong><p>{i.period_start} إلى {i.period_end} · {sar(i.total)} شامل الضريبة · تستحق {i.due_date}</p></div>
        <div className="ops-actions"><Badge className={`status-badge ${invStatus[i.status]?.[1]}`}>{invStatus[i.status]?.[0]}</Badge><Button size="sm" variant="outline" onClick={() => setView(i)}><FileText /> عرض</Button></div></div>)}
    </article>
  </>;
}

// ───────── مدير النظام: الباقات والاشتراكات والفواتير ─────────
type Overview = { school_id: string; school_name: string; region: string | null; school_status: string; plan_id: string | null; plan_name: string | null; sub_status: string | null; billing_period: string | null; monthly_price: number | null; ends_on: string | null; buses: number; students: number; open_total: number; last_invoice_end: string | null };

export function AdminBilling() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [rows, setRows] = useState<Overview[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [editPlan, setEditPlan] = useState<Partial<Plan> | null>(null);
  const [editSub, setEditSub] = useState<{ school: Overview; plan: string; status: string; period: string; start: string; end: string } | null>(null);
  const [issueFor, setIssueFor] = useState<{ school: Overview; start: string; end: string } | null>(null);
  const [payFor, setPayFor] = useState<{ inv: Invoice; ref: string } | null>(null);
  const [view, setView] = useState<Invoice | null>(null);

  const load = useCallback(async () => {
    const [p, o, i] = await Promise.all([
      supabase.from("masari_plans").select("*").order("monthly_price"),
      supabase.rpc("admin_billing_overview"),
      supabase.from("masari_invoices").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (o.error) { setMsg({ text: errText(o.error.message), ok: false }); return; }
    setPlans((p.data ?? []) as Plan[]); setRows((o.data ?? []) as Overview[]); setInvoices((i.data ?? []) as Invoice[]);
  }, []);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [load]);
  const act = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true); setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setMsg({ text: errText(error.message), ok: false }); return false; }
    setMsg({ text: ok, ok: true }); await load(); return true;
  };
  const nameOf = (id: string) => rows.find((r) => r.school_id === id)?.school_name ?? "مدرسة";
  const mrr = rows.filter((r) => r.sub_status === "active").reduce((a, r) => a + Number(r.monthly_price ?? 0), 0);
  const due = invoices.filter((i) => i.status === "issued").reduce((a, i) => a + Number(i.total), 0);
  if (view) return <InvoiceView inv={view} schoolName={nameOf(view.school_id)} onClose={() => setView(null)} />;

  return <>
    <div className="welcome"><div><p className="eyebrow">مدير النظام</p><h1>الاشتراكات والفواتير</h1><p>باقات مساري، واشتراك كل مدرسة، وإصدار الفواتير وتسجيل الدفع.</p></div></div>
    <Flash msg={msg} />
    <div className="kpi-grid">
      <div className="kpi-tile"><span className="kpi-value">{sar(mrr)}</span><span className="kpi-label">الإيراد الشهري من الاشتراكات النشطة</span></div>
      <div className="kpi-tile"><span className="kpi-value">{rows.filter((r) => r.sub_status === "active").length}</span><span className="kpi-label">مدارس مشتركة</span></div>
      <div className="kpi-tile"><span className="kpi-value">{rows.filter((r) => r.sub_status === "trial").length}</span><span className="kpi-label">فترة تجريبية</span></div>
      <div className={`kpi-tile ${due ? "warn" : ""}`}><span className="kpi-value">{sar(due)}</span><span className="kpi-label">فواتير مستحقة</span></div>
    </div>

    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">الباقات</p><h2>باقات مساري</h2></div><Button size="sm" variant="outline" onClick={() => setEditPlan({ name: "", monthly_price: 0, max_buses: null, max_students: null, description: "", is_active: true })}>باقة جديدة</Button></div>
      {plans.map((p) => <div className="ops-row" key={p.id}><div><strong>{p.name} · {sar(p.monthly_price)} شهريًا</strong><p>{[p.max_buses ? `حتى ${p.max_buses} باص` : "باصات بلا حد", p.max_students ? `حتى ${p.max_students} طالب` : "طلاب بلا حد", p.description].filter(Boolean).join(" · ")}</p></div>
        <div className="ops-actions">{!p.is_active && <Badge className="status-badge tone-2">موقوفة</Badge>}<Button size="sm" variant="outline" onClick={() => setEditPlan(p)}>تعديل</Button></div></div>)}
      {editPlan && <div className="dir-tool"><div className="claim-grid">
        <label htmlFor="pl-name">الاسم<input id="pl-name" value={editPlan.name ?? ""} onChange={(e) => setEditPlan({ ...editPlan, name: e.target.value })} /></label>
        <label htmlFor="pl-price">السعر الشهري (ر.س قبل الضريبة)<input id="pl-price" inputMode="decimal" value={String(editPlan.monthly_price ?? "")} onChange={(e) => setEditPlan({ ...editPlan, monthly_price: Number(e.target.value) })} /></label>
        <label htmlFor="pl-buses">حد الباصات (فارغ = بلا حد)<input id="pl-buses" inputMode="numeric" value={editPlan.max_buses ?? ""} onChange={(e) => setEditPlan({ ...editPlan, max_buses: e.target.value ? Number(e.target.value) : null })} /></label>
        <label htmlFor="pl-students">حد الطلاب (فارغ = بلا حد)<input id="pl-students" inputMode="numeric" value={editPlan.max_students ?? ""} onChange={(e) => setEditPlan({ ...editPlan, max_students: e.target.value ? Number(e.target.value) : null })} /></label>
        <label htmlFor="pl-desc" className="wide">الوصف<input id="pl-desc" value={editPlan.description ?? ""} onChange={(e) => setEditPlan({ ...editPlan, description: e.target.value })} /></label>
        <label className="planner-check" htmlFor="pl-active"><input id="pl-active" type="checkbox" checked={editPlan.is_active ?? true} onChange={(e) => setEditPlan({ ...editPlan, is_active: e.target.checked })} /> الباقة متاحة</label>
      </div><div className="ops-actions"><Button disabled={busy || !editPlan.name?.trim() || !(Number(editPlan.monthly_price) >= 0)} onClick={() => void act(() => supabase.rpc("admin_save_plan", { p_id: editPlan.id ?? null, p_name: editPlan.name, p_monthly_price: editPlan.monthly_price, p_max_buses: editPlan.max_buses, p_max_students: editPlan.max_students, p_description: editPlan.description, p_active: editPlan.is_active }), "تم حفظ الباقة.").then((ok) => { if (ok) setEditPlan(null); })}>حفظ الباقة</Button><Button variant="outline" onClick={() => setEditPlan(null)}>إلغاء</Button></div></div>}
    </article>

    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">المدارس</p><h2>اشتراك كل مدرسة</h2></div><WalletCards className="title-icon" /></div>
      {rows.length === 0 && <p className="muted-label">لا توجد مدارس مفعّلة بعد.</p>}
      {rows.map((r) => <div className="ops-row data-row" key={r.school_id}>
        <div><strong>{r.school_name}</strong><p>{[r.region, r.plan_name ? `باقة ${r.plan_name} · ${sar(r.monthly_price)}` : "بلا باقة", r.billing_period && periodText[r.billing_period], `${r.buses} باص · ${r.students} طالب`, Number(r.open_total) > 0 && `مستحق ${sar(r.open_total)}`, r.last_invoice_end && `آخر فوترة حتى ${r.last_invoice_end}`].filter(Boolean).join(" · ")}</p>
          {editSub?.school.school_id === r.school_id && <div className="inline-form">
            <select aria-label="الباقة" value={editSub.plan} onChange={(e) => setEditSub({ ...editSub, plan: e.target.value })}><option value="">اختر الباقة</option>{plans.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <select aria-label="الحالة" value={editSub.status} onChange={(e) => setEditSub({ ...editSub, status: e.target.value })}>{Object.entries(subStatus).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
            <select aria-label="دورة الفوترة" value={editSub.period} onChange={(e) => setEditSub({ ...editSub, period: e.target.value })}>{Object.entries(periodText).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <label htmlFor="sub-start">من</label><input id="sub-start" type="date" value={editSub.start} onChange={(e) => setEditSub({ ...editSub, start: e.target.value })} />
            <label htmlFor="sub-end">إلى</label><input id="sub-end" type="date" value={editSub.end} onChange={(e) => setEditSub({ ...editSub, end: e.target.value })} />
            <Button size="sm" disabled={busy || !editSub.plan} onClick={() => void act(() => supabase.rpc("admin_set_school_subscription", { p_school: r.school_id, p_plan: editSub.plan, p_status: editSub.status, p_period: editSub.period, p_starts_on: editSub.start || null, p_ends_on: editSub.end || null }), `تم حفظ اشتراك ${r.school_name}.`).then((ok) => { if (ok) setEditSub(null); })}>حفظ</Button>
            <Button size="sm" variant="outline" onClick={() => setEditSub(null)}>إلغاء</Button></div>}
          {issueFor?.school.school_id === r.school_id && <div className="inline-form">
            <label htmlFor="inv-start">الفترة من</label><input id="inv-start" type="date" value={issueFor.start} onChange={(e) => setIssueFor({ ...issueFor, start: e.target.value })} />
            <label htmlFor="inv-end">إلى</label><input id="inv-end" type="date" value={issueFor.end} onChange={(e) => setIssueFor({ ...issueFor, end: e.target.value })} />
            <Button size="sm" disabled={busy || !issueFor.start || !issueFor.end} onClick={() => void act(() => supabase.rpc("admin_issue_invoice", { p_school: r.school_id, p_period_start: issueFor.start, p_period_end: issueFor.end }), `صدرت فاتورة ${r.school_name} ووصل إشعارها للمدرسة.`).then((ok) => { if (ok) setIssueFor(null); })}>إصدار</Button>
            <Button size="sm" variant="outline" onClick={() => setIssueFor(null)}>إلغاء</Button></div>}
        </div>
        <div className="ops-actions">
          {r.sub_status && <Badge className={`status-badge ${subStatus[r.sub_status]?.[1]}`}>{subStatus[r.sub_status]?.[0]}</Badge>}
          <Button size="sm" variant="outline" onClick={() => { setIssueFor(null); setEditSub({ school: r, plan: r.plan_id ?? "", status: r.sub_status ?? "trial", period: r.billing_period ?? "monthly", start: "", end: r.ends_on ?? "" }); }}>{r.plan_id ? "تعديل الاشتراك" : "تحديد باقة"}</Button>
          {r.plan_id && <Button size="sm" variant="outline" onClick={() => { setEditSub(null); setIssueFor({ school: r, start: monthStart(), end: monthEnd() }); }}>إصدار فاتورة</Button>}
        </div>
      </div>)}
    </article>

    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">الفواتير</p><h2>آخر الفواتير</h2></div><FileText className="title-icon" /></div>
      {invoices.length === 0 && <p className="muted-label">لا توجد فواتير بعد.</p>}
      {invoices.map((i) => <div className="ops-row" key={i.id}><div><strong><span dir="ltr">{i.number}</span> · {nameOf(i.school_id)}</strong><p>{i.period_start} إلى {i.period_end} · {sar(i.amount)} + ضريبة {sar(i.vat)} = {sar(i.total)} · تستحق {i.due_date}{i.payment_ref ? ` · مرجع ${i.payment_ref}` : ""}</p>
        {payFor?.inv.id === i.id && <div className="inline-form"><label htmlFor="pay-ref">مرجع الدفع (تحويل بنكي…)</label><input id="pay-ref" value={payFor.ref} onChange={(e) => setPayFor({ ...payFor, ref: e.target.value })} />
          <Button size="sm" disabled={busy} onClick={() => void act(() => supabase.rpc("admin_set_invoice_status", { p_invoice: i.id, p_status: "paid", p_ref: payFor.ref }), `سُجّل دفع ${i.number}.`).then((ok) => { if (ok) setPayFor(null); })}>تأكيد الدفع</Button>
          <Button size="sm" variant="outline" onClick={() => setPayFor(null)}>إلغاء</Button></div>}</div>
        <div className="ops-actions"><Badge className={`status-badge ${invStatus[i.status]?.[1]}`}>{invStatus[i.status]?.[0]}</Badge>
          {i.status === "issued" && <Button size="sm" disabled={busy} onClick={() => setPayFor({ inv: i, ref: "" })}>تسجيل دفع</Button>}
          {i.status === "issued" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => supabase.rpc("admin_set_invoice_status", { p_invoice: i.id, p_status: "void", p_ref: null }), `أُلغيت ${i.number}.`)}>إلغاء الفاتورة</Button>}
          <Button size="sm" variant="outline" onClick={() => setView(i)}><FileText /> عرض</Button></div></div>)}
    </article>
  </>;
}
