"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

// فريق المدرسة: مدير المدرسة يضيف الموظفين بأدوار محددة الصلاحيات.

export const TEAM_ROLES: Record<string, { label: string; desc: string }> = {
  school_admin: { label: "مدير مدرسة", desc: "كل الصلاحيات، ومنها الفريق والاشتراك" },
  supervisor: { label: "مشرف نقل", desc: "الطلاب والمسارات والرحلات والطلبات والمراقبة" },
  operations: { label: "تشغيل", desc: "التشغيل اليومي مثل مشرف النقل" },
  gate: { label: "موظف بوابة", desc: "شاشة نداء البوابة فقط" },
  control_tower: { label: "برج مراقبة", desc: "متابعة الرحلات والتنبيهات فقط" },
};
type Member = { id: string; user_id: string; email: string; full_name: string | null; role: string; status: string };
const teamErr = (m: string) => m.includes("USER_NOT_FOUND") ? "لا يوجد حساب مؤكَّد بهذا البريد. اطلب من الموظف إنشاء حساب في مساري أولًا." : m.includes("CANNOT_CHANGE_SELF") ? "لا يمكنك تغيير صلاحيتك بنفسك." : m.includes("school_members_role_check") ? "هذا الدور يحتاج تشغيل ملف SQL الأخير في Supabase." : m.includes("FORBIDDEN") ? "هذه الصفحة لمدير المدرسة فقط." : "تعذر تنفيذ الطلب. حاول مرة أخرى.";

export function SchoolTeam({ schoolId }: { schoolId: string }) {
  const [rows, setRows] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("gate");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("school_team", { p_school: schoolId });
    if (error) { setMsg({ ok: false, text: teamErr(error.message) }); return; }
    setRows((data ?? []) as Member[]);
  }, [schoolId]);
  useEffect(() => { let alive = true; void (async () => { if (alive) await load().catch(() => {}); })(); return () => { alive = false; }; }, [load]);
  const run = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true); setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setMsg({ ok: false, text: teamErr(error.message) }); return; }
    setMsg({ ok: true, text: ok }); await load();
  };
  return <>
    <div className="welcome"><div><p className="eyebrow">إدارة المدرسة</p><h1>فريق المدرسة</h1><p>أضف موظفيك بحساباتهم في مساري، ولكل واحد صلاحيات دوره فقط.</p></div></div>
    {msg && <p className={`save-strip ops-message ${msg.ok ? "" : "ops-error"}`}>{msg.ok ? <Check /> : <X />}<span>{msg.text}</span></p>}
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">إضافة موظف</p><h2>عضو جديد</h2></div><UserPlus className="title-icon" /></div>
      <div className="claim-grid">
        <label htmlFor="team-email">بريد الموظف (حسابه في مساري)<input id="team-email" dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></label>
        <label htmlFor="team-role">الدور<select id="team-role" value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(TEAM_ROLES).map(([v, r]) => <option key={v} value={v}>{r.label}</option>)}</select></label>
      </div>
      <p className="muted-label">{TEAM_ROLES[role].desc}.</p>
      <div className="ops-actions"><Button disabled={busy || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())} onClick={() => void run(() => supabase.rpc("school_add_member", { p_school: schoolId, p_email: email.trim(), p_role: role }), `أُضيف ${email.trim()} بدور ${TEAM_ROLES[role].label}.`).then(() => setEmail(""))}><UserPlus /> إضافة</Button></div>
    </article>
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">الفريق</p><h2>{rows.length} عضو</h2></div><Users className="title-icon" /></div>
      {rows.map((m) => <div className="ops-row" key={m.id}>
        <div><strong dir="ltr">{m.email}</strong>{m.full_name && <span className="muted-inline"> · {m.full_name}</span>}<p>{TEAM_ROLES[m.role]?.label ?? m.role}</p></div>
        <div className="ops-actions">
          <select className="sub-driver" aria-label={`دور ${m.email}`} value={m.role} disabled={busy || m.status !== "active"} onChange={(e) => void run(() => supabase.rpc("school_add_member", { p_school: schoolId, p_email: m.email, p_role: e.target.value }), `أصبح ${m.email} ${TEAM_ROLES[e.target.value]?.label}.`)}>
            {Object.entries(TEAM_ROLES).map(([v, r]) => <option key={v} value={v}>{r.label}</option>)}</select>
          <Badge className={`status-badge ${m.status === "active" ? "tone-0" : "tone-2"}`}>{m.status === "active" ? "نشط" : "موقوف"}</Badge>
          {m.status === "active" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => supabase.rpc("school_set_member_status", { p_member: m.id, p_status: "suspended" }), `أُوقفت صلاحية ${m.email}.`)}>إيقاف</Button>
            : <Button size="sm" disabled={busy} onClick={() => void run(() => supabase.rpc("school_set_member_status", { p_member: m.id, p_status: "active" }), `أُعيدت صلاحية ${m.email}.`)}>إعادة</Button>}
        </div>
      </div>)}
    </article>
  </>;
}
