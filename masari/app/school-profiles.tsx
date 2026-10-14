"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

// ملف الطالب وبيانات السائق من شاشة المدرسة. الحفظ يمر عبر RLS ودوال الخادم (set_student_status وadd_student_guardian ...).

type Done = (text: string, ok: boolean) => void;
const profileError = (m = "") =>
  m.includes("REASON_REQUIRED") ? "اكتب السبب أولًا."
  : m.includes("LAST_GUARDIAN") ? "لا يمكن حذف آخر ولي أمر للطالب. أضف غيره أولًا."
  : m.includes("ALREADY_LINKED") ? "ولي الأمر مرتبط بالطالب مسبقًا."
  : m.includes("CONTACT_REQUIRED") ? "اكتب جوال ولي الأمر أو بريده."
  : m.includes("INVALID_EMAIL") ? "البريد غير صحيح."
  : m.includes("NAME_REQUIRED") ? "الاسم قصير جدًا."
  : m.includes("EMAIL_LOCKED") ? "حساب السائق مربوط بهذا البريد، فلا يتغير."
  : m.includes("DRIVER_ON_TRIP") ? "السائق في رحلة الآن. أوقفه بعد انتهائها."
  : m.includes("students_no_duplicates") || m.includes("23505") ? "يوجد طالب بنفس الاسم والصف."
  : m.includes("FORBIDDEN") || m.includes("42501") ? "ليست لديك صلاحية لهذا الإجراء."
  : "تعذر الحفظ. حاول مرة أخرى.";

export const studentStatusLabel: Record<string, string> = { active: "نشط", suspended: "موقوف مؤقتًا", inactive: "منسحب", pending: "قيد الاعتماد" };

type Profile = { full_name: string; grade: string; class_name: string; home_address: string; emergency_contact_name: string; emergency_contact_phone: string; service_status: string };
type GuardianLink = { guardian_id: string; relation: string | null; is_primary: boolean; guardians: { full_name: string; phone: string | null; email: string | null; user_id: string | null } | null };

export function StudentProfile({ studentId, onDone, onClose }: { studentId: string; onDone: Done; onClose: () => void }) {
  const [form, setForm] = useState<Profile | null>(null);
  const [links, setLinks] = useState<GuardianLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [g, setG] = useState({ name: "", phone: "", email: "", relation: "" });
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const [{ data: st }, { data: gs }] = await Promise.all([
      supabase.from("students").select("full_name,grade,class_name,home_address,emergency_contact_name,emergency_contact_phone,service_status").eq("id", studentId).single(),
      supabase.from("guardian_students").select("guardian_id,relation,is_primary,guardians(full_name,phone,email,user_id)").eq("student_id", studentId).order("is_primary", { ascending: false }),
    ]);
    if (st) setForm({ full_name: st.full_name ?? "", grade: st.grade ?? "", class_name: st.class_name ?? "", home_address: st.home_address ?? "", emergency_contact_name: st.emergency_contact_name ?? "", emergency_contact_phone: st.emergency_contact_phone ?? "", service_status: st.service_status });
    setLinks(((gs ?? []) as unknown as (GuardianLink & { guardians: GuardianLink["guardians"] | GuardianLink["guardians"][] })[]).map((l) => ({ ...l, guardians: Array.isArray(l.guardians) ? l.guardians[0] ?? null : l.guardians })));
  }, [studentId]);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [load]);

  const run = async (fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, ok: string) => {
    setBusy(true); setError("");
    try {
      const { error: e } = await fn();
      if (e) { setError(profileError(`${e.message ?? ""} ${e.code ?? ""}`)); return false; }
      await load(); onDone(ok, true); return true;
    } finally { setBusy(false); }
  };

  if (!form) return <div className="student-profile"><p className="muted-label">جارٍ التحميل…</p></div>;
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  const save = () => run(() => supabase.from("students").update({
    full_name: form.full_name.trim(), grade: form.grade.trim() || null, class_name: form.class_name.trim() || null, home_address: form.home_address.trim() || null,
    emergency_contact_name: form.emergency_contact_name.trim() || null, emergency_contact_phone: form.emergency_contact_phone.trim() || null,
  }).eq("id", studentId), `حُفظت بيانات ${form.full_name.trim()}.`);
  const setStatus = (status: string) => {
    const reason = status === "active" ? null : window.prompt(status === "inactive" ? "سبب الانسحاب (يصل لولي الأمر):" : "سبب الإيقاف المؤقت (يصل لولي الأمر):");
    if (status !== "active" && !reason?.trim()) return;
    void run(() => supabase.rpc("set_student_status", { p_student: studentId, p_status: status, p_reason: reason?.trim() ?? null }),
      status === "active" ? `عاد ${form.full_name} للنقل. أسنده لمساره إن لم يكن مسندًا.` : status === "inactive" ? `سُجل انسحاب ${form.full_name} وأُلغي إسناده للمسارات.` : `أُوقف نقل ${form.full_name} مؤقتًا؛ لن يظهر في الرحلات حتى يعود.`);
  };
  const addGuardian = async () => {
    const ok = await run(() => supabase.rpc("add_student_guardian", { p_student: studentId, p_name: g.name.trim(), p_phone: g.phone.trim() || null, p_email: g.email.trim() || null, p_relation: g.relation.trim() || null }),
      g.email.trim() ? `أُضيف ${g.name.trim()}، ويُربط حسابه عند دخوله بالبريد ${g.email.trim()}.` : `أُضيف ${g.name.trim()}.`);
    if (ok) { setG({ name: "", phone: "", email: "", relation: "" }); setAddOpen(false); }
  };
  const removeGuardian = (l: GuardianLink) => {
    if (window.confirm(`إزالة ${l.guardians?.full_name ?? "ولي الأمر"} من هذا الطالب؟ لن يرى رحلاته بعد ذلك.`))
      void run(() => supabase.rpc("remove_student_guardian", { p_student: studentId, p_guardian: l.guardian_id }), "أُزيل ولي الأمر من الطالب.");
  };

  return <div className="student-profile">
    <div className="panel-head"><div><p className="eyebrow">ملف الطالب</p><h3>{form.full_name}</h3></div>
      <Badge className={`status-badge ${form.service_status === "active" ? "tone-2" : "tone-1"}`}>{studentStatusLabel[form.service_status] ?? form.service_status}</Badge>
      <Button size="sm" variant="outline" onClick={onClose}><X /> إغلاق</Button></div>
    {error && <p className="save-strip ops-message ops-error"><X /><span>{error}</span></p>}
    <div className="claim-grid">
      <label>اسم الطالب<input value={form.full_name} onChange={set("full_name")} /></label>
      <label>الصف<input value={form.grade} onChange={set("grade")} /></label>
      <label>الفصل<input value={form.class_name} onChange={set("class_name")} placeholder="مثال: 3/أ" /></label>
      <label>عنوان المنزل<input value={form.home_address} onChange={set("home_address")} /></label>
      <label>جهة اتصال الطوارئ<input value={form.emergency_contact_name} onChange={set("emergency_contact_name")} placeholder="الاسم" /></label>
      <label>جوال الطوارئ<input dir="ltr" inputMode="tel" value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} placeholder="05xxxxxxxx" /></label>
    </div>
    <div className="ops-actions">
      <Button size="sm" disabled={busy || form.full_name.trim().length < 3} onClick={() => void save()}>حفظ البيانات</Button>
      {form.service_status !== "active" && <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("active")}>إعادة للنقل</Button>}
      {form.service_status === "active" && <Button size="sm" variant="outline" disabled={busy} onClick={() => setStatus("suspended")}>إيقاف مؤقت</Button>}
      {form.service_status !== "inactive" && <Button size="sm" variant="outline" className="danger-btn" disabled={busy} onClick={() => setStatus("inactive")}>انسحاب من النقل</Button>}
    </div>

    <h4 className="ops-subhead">أولياء الأمور ({links.length})</h4>
    {links.map((l) => <div className="ops-row" key={l.guardian_id}>
      <div><strong>{l.guardians?.full_name ?? "ولي أمر"}</strong>{l.is_primary && <Badge className="status-badge tone-0 req-badge">الأساسي</Badge>}
        <p>{[l.relation, l.guardians?.phone, l.guardians?.email, l.guardians?.user_id ? "الحساب مربوط" : "لم يسجل بعد"].filter(Boolean).join(" · ")}</p></div>
      {links.length > 1 && <Button size="sm" variant="outline" disabled={busy} onClick={() => removeGuardian(l)}>إزالة</Button>}
    </div>)}
    {addOpen ? <div className="dir-tool"><div className="claim-grid">
      <label>الاسم<input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></label>
      <label>الصلة<input value={g.relation} onChange={(e) => setG({ ...g, relation: e.target.value })} placeholder="الأم، الأخ، السائق الخاص…" /></label>
      <label>الجوال<input dir="ltr" inputMode="tel" value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} placeholder="05xxxxxxxx" /></label>
      <label>البريد (لربط حسابه)<input dir="ltr" type="email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} /></label>
    </div><div className="ops-actions"><Button size="sm" disabled={busy || g.name.trim().length < 2 || (!g.phone.trim() && !g.email.trim())} onClick={() => void addGuardian()}>إضافة ولي الأمر</Button><Button size="sm" variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button></div></div>
      : <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><Plus /> ولي أمر آخر</Button>}
  </div>;
}

type DriverRow = { id: string; full_name: string; status: string; user_id: string | null; phone?: string | null; email?: string | null; license_number?: string | null };

export function DriverEdit({ driver, canSuspend, onDone, onClose }: { driver: DriverRow; canSuspend: boolean; onDone: Done; onClose: () => void }) {
  const [form, setForm] = useState({ name: driver.full_name, phone: driver.phone ?? "", email: driver.email ?? "", license: driver.license_number ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const call = async <T,>(fn: () => PromiseLike<{ data: T | null; error: { message?: string; code?: string } | null }>) => {
    setBusy(true); setError("");
    try { const { data, error: e } = await fn(); if (e) { setError(profileError(`${e.message ?? ""} ${e.code ?? ""}`)); return null; } return data ?? ({} as T); }
    finally { setBusy(false); }
  };
  const save = async () => {
    const r = await call(() => supabase.rpc("update_driver_profile", { p_driver: driver.id, p_name: form.name.trim(), p_phone: form.phone.trim() || null, p_email: form.email.trim() || null, p_license: form.license.trim() || null }));
    if (r) onDone(`حُفظت بيانات ${form.name.trim()}.`, true);
  };
  const setStatus = async (status: "active" | "suspended") => {
    const reason = status === "suspended" ? window.prompt("سبب الإيقاف (يصل للسائق):") : null;
    if (status === "suspended" && !reason?.trim()) return;
    const r = await call<{ scheduled_today: number }>(() => supabase.rpc("set_driver_status", { p_driver: driver.id, p_status: status, p_reason: reason?.trim() ?? null }));
    if (!r) return;
    const today = r.scheduled_today ?? 0;
    onDone(status === "active" ? `أُعيد تفعيل ${driver.full_name}.` : today ? `أُوقف ${driver.full_name}. له ${today} رحلة اليوم؛ اختر سائقًا بديلًا من «رحلات اليوم».` : `أُوقف ${driver.full_name}، ولن تُنشأ له رحلات حتى يعود.`, status === "active" || !today);
  };
  return <div className="student-profile">
    <div className="panel-head"><div><p className="eyebrow">بيانات السائق</p><h3>{driver.full_name}</h3></div><Button size="sm" variant="outline" onClick={onClose}><X /> إغلاق</Button></div>
    {error && <p className="save-strip ops-message ops-error"><X /><span>{error}</span></p>}
    <div className="claim-grid">
      <label>الاسم<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label>الجوال<input dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
      <label>البريد{driver.user_id && " (مربوط بحسابه)"}<input dir="ltr" type="email" value={form.email} disabled={Boolean(driver.user_id)} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label>رقم الرخصة<input dir="ltr" value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} /></label>
    </div>
    <div className="ops-actions">
      <Button size="sm" disabled={busy || form.name.trim().length < 3} onClick={() => void save()}>حفظ البيانات</Button>
      {canSuspend && driver.status === "active" && <Button size="sm" variant="outline" className="danger-btn" disabled={busy} onClick={() => void setStatus("suspended")}>إيقاف السائق</Button>}
      {canSuspend && driver.status === "suspended" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void setStatus("active")}>إعادة التفعيل</Button>}
    </div>
  </div>;
}
