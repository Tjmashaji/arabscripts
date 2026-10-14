"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil, RadioTower, School, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { TransferPanel, UserTools } from "./admin-suite";

// صفحات الإدارة العليا:
// - نظرة المنطقة: للإدارة التنفيذية (منطقتها فقط) ولمدير النظام (كل المناطق).
// - المستخدمون، إدارة البيانات، سجل التدقيق: لمدير النظام فقط (المطوّر).

type Msg = { text: string; ok: boolean } | null;
const Flash = ({ msg }: { msg: Msg }) => msg && <p className={`save-strip ops-message ${msg.ok ? "" : "ops-error"}`}>{msg.ok ? <Check /> : <X />}<span>{msg.text}</span></p>;
const errText = (m: string) => m.includes("FORBIDDEN") ? "هذا الإجراء غير مسموح لحسابك." : m.includes("CANNOT_CHANGE_SELF") ? "لا يمكنك تغيير صلاحيات حسابك بنفسك." : m.includes("REASON_REQUIRED") ? "اكتب السبب." : m.includes("REGION_REQUIRED") ? "حدد المنطقة." : m.includes("foreign key") || m.includes("violates") ? "لا يمكن: السجل مرتبط ببيانات أخرى أو القيمة غير مقبولة." : m.includes("Could not find the function") ? "هذه الميزة تحتاج تشغيل ملف SQL الأخير في Supabase." : m.includes("invalid input") ? "قيمة غير صحيحة لأحد الحقول." : "تعذر تنفيذ الطلب. حاول مرة أخرى.";
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }) : "—";

// ───────── نظرة المنطقة ─────────
type DirRow = { status: string; interest_count: number; open_claims: number };
type LiveRow = { trip_id: string; open_emergencies: number; last_seen: string | null; offline_after_seconds: number | null };

export function RegionOverview({ region, platformAdmin, onOpen }: { region: string | null; platformAdmin: boolean; onOpen: (view: "schools" | "control") => void }) {
  const [dir, setDir] = useState<DirRow[] | null>(null);
  const [claims, setClaims] = useState(0);
  const [live, setLive] = useState<LiveRow[]>([]);
  const [offline, setOffline] = useState(0);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [d, c, l] = await Promise.all([
        supabase.rpc("admin_school_directory", { p_status: null, p_query: null }),
        supabase.rpc("admin_claim_requests", { p_status: null }),
        supabase.rpc("live_trips"),
      ]);
      if (!alive) return;
      if (d.error) { setErr(errText(d.error.message)); return; }
      setDir((d.data ?? []) as DirRow[]); setClaims((c.data ?? []).length); const liveRows = (l.data ?? []) as LiveRow[]; setLive(liveRows);
      const now = Date.now();
      setOffline(liveRows.filter((r) => !r.last_seen || now - new Date(r.last_seen).getTime() > (r.offline_after_seconds ?? 120) * 1000).length);
    })().catch(() => {});
    return () => { alive = false; };
  }, []);
  const count = (s: string) => dir?.filter((r) => r.status === s).length ?? 0;
  const interest = dir?.reduce((a, r) => a + Number(r.interest_count), 0) ?? 0;
  const emergencies = live.reduce((a, r) => a + Number(r.open_emergencies), 0);
  const scope = platformAdmin ? "كل المناطق" : region ? `منطقة ${region}` : "منطقتك";
  const tiles = [
    { label: "مدارس مشتركة", value: count("active"), view: "schools" as const },
    { label: "غير مشتركة بعد", value: count("unclaimed"), view: "schools" as const },
    { label: "طلبات تفعيل مفتوحة", value: claims, view: "schools" as const, warn: claims > 0 },
    { label: "طلبات أولياء الأمور", value: interest, view: "schools" as const },
    { label: "رحلات جارية الآن", value: live.length, view: "control" as const },
    { label: "بلاغات مفتوحة", value: emergencies, view: "control" as const, warn: emergencies > 0 },
    { label: "باصات بلا إشارة", value: offline, view: "control" as const, warn: offline > 0 },
    { label: "مدارس موقوفة", value: count("suspended"), view: "schools" as const },
  ];
  return <>
    <div className="welcome"><div><p className="eyebrow">{platformAdmin ? "مدير النظام" : "الإدارة التنفيذية"}</p><h1>نظرة على {scope}</h1><p>المدارس وطلبات التفعيل ورحلات اليوم في {scope}. اضغط أي رقم لفتح تفاصيله.</p></div></div>
    {err && <Flash msg={{ text: err, ok: false }} />}
    {!platformAdmin && !region && <Flash msg={{ text: "حسابك غير مربوط بمنطقة بعد. اطلب من مدير النظام تحديد منطقتك.", ok: false }} />}
    <div className="kpi-grid">{tiles.map((t) => <button key={t.label} className={`kpi-tile ${t.warn ? "warn" : ""}`} onClick={() => onOpen(t.view)}>
      <span className="kpi-value">{dir ? t.value : "…"}</span><span className="kpi-label">{t.label}</span>
    </button>)}</div>
    <div className="ops-actions"><Button variant="outline" onClick={() => onOpen("schools")}><School /> دليل المدارس</Button><Button variant="outline" onClick={() => onOpen("control")}><RadioTower /> برج المراقبة</Button></div>
  </>;
}

// ───────── المستخدمون ─────────
type UserRow = { user_id: string; email: string; full_name: string | null; phone: string | null; status: string; suspended_until: string | null; email_confirmed: boolean; created_at: string; last_sign_in_at: string | null;
  platform_roles: { role: string; region: string | null }[]; schools: { school_id: string; school_name: string; role: string; status: string }[];
  driver: { school_id: string; school_name: string; status: string } | null; guardian_schools: { school_id: string; school_name: string }[] };
const userStatus: Record<string, string> = { active: "مفعّل", pending: "بانتظار التفعيل", suspended: "موقوف" };
const memberRole: Record<string, string> = { school_admin: "مدير مدرسة", operations: "تشغيل", supervisor: "مشرف نقل", gate: "موظف بوابة", control_tower: "برج مراقبة" };
const ROLE_OPTIONS: { value: string; label: string; needs: "none" | "region" | "school" }[] = [
  { value: "guardian", label: "ولي أمر", needs: "school" }, { value: "driver", label: "سائق", needs: "school" },
  { value: "school_admin", label: "مدير مدرسة", needs: "school" }, { value: "supervisor", label: "مشرف نقل", needs: "school" },
  { value: "operations", label: "تشغيل مدرسة", needs: "school" }, { value: "gate", label: "موظف بوابة", needs: "school" }, { value: "control_tower", label: "برج مراقبة المدرسة", needs: "school" },
  { value: "executive", label: "إدارة تنفيذية (منطقة)", needs: "region" }, { value: "super_admin", label: "مدير النظام", needs: "none" },
];
const SUSPEND_FOR: { value: string; label: string; hours: number | null }[] = [
  { value: "1d", label: "يوم واحد", hours: 24 }, { value: "3d", label: "3 أيام", hours: 72 }, { value: "7d", label: "أسبوع", hours: 168 },
  { value: "30d", label: "شهر", hours: 720 }, { value: "forever", label: "حتى أعيد تفعيله", hours: null },
];
const userErr = (m: string) => m.includes("CONFIRM_MISMATCH") ? "البريد المكتوب لا يطابق بريد الحساب." : m.includes("CANNOT_DELETE_ADMIN") ? "أزل دور «مدير النظام» من الحساب أولًا ثم احذفه." : m.includes("SCHOOL_REQUIRED") ? "اختر المدرسة." : m.includes("drivers_user_id_key") ? "الحساب سائق في مدرسة أخرى." : m.includes("Could not find the function") ? "هذه الميزة تحتاج تشغيل ملف SQL الأخير في Supabase." : errText(m);

type RoleChip = { key: string; label: string; role: string; school?: string };
const rolesOf = (u: UserRow): RoleChip[] => [
  ...u.platform_roles.map((r) => ({ key: r.role, role: r.role, label: r.role === "super_admin" ? "مدير النظام" : `إدارة تنفيذية · ${r.region ?? "بلا منطقة"}` })),
  ...u.schools.map((m) => ({ key: `m-${m.school_id}`, role: m.role, school: m.school_id, label: `${memberRole[m.role] ?? m.role} · ${m.school_name}` })),
  ...(u.driver ? [{ key: "driver", role: "driver", school: u.driver.school_id, label: `سائق · ${u.driver.school_name}` }] : []),
  ...u.guardian_schools.map((g) => ({ key: `g-${g.school_id}`, role: "guardian", school: g.school_id, label: `ولي أمر · ${g.school_name}` })),
];

function SchoolPick({ value, onChange }: { value: { id: string; name: string } | null; onChange: (s: { id: string; name: string } | null) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ id: string; name: string; city: string | null }[]>([]);
  const search = async () => { const { data } = await supabase.rpc("admin_school_directory", { p_status: "active", p_query: q.trim() || null }); setRes(((data ?? []) as { id: string; name: string; city: string | null }[]).slice(0, 8)); };
  if (value) return <p className="picked-school"><School className="inline-icon" /> {value.name} <button className="text-link" onClick={() => onChange(null)}>تغيير</button></p>;
  return <div className="school-pick"><div className="finder-search"><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} placeholder="ابحث عن مدرسة مفعّلة" aria-label="البحث عن مدرسة" /><Button size="sm" variant="outline" onClick={() => void search()}><Search /> بحث</Button></div>
    {res.map((s) => <button key={s.id} className="school-pick-row" onClick={() => onChange({ id: s.id, name: s.name })}>{s.name}{s.city ? ` · ${s.city}` : ""}</button>)}</div>;
}

function UserPanel({ u, mode, busy, onAct, onClose }: { u: UserRow; mode: "role" | "suspend" | "delete"; busy: boolean; onAct: (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => Promise<void>; onClose: () => void }) {
  const [role, setRole] = useState("guardian");
  const [school, setSchool] = useState<{ id: string; name: string } | null>(null);
  const [region, setRegion] = useState("الخرج");
  const [period, setPeriod] = useState("1d");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const needs = ROLE_OPTIONS.find((r) => r.value === role)?.needs ?? "none";
  if (mode === "role") return <div className="user-panel">
    <p className="field-title">أدوار الحساب الحالية</p>
    {rolesOf(u).length === 0 ? <p className="muted-label">بلا دور.</p> : <div className="role-chips">{rolesOf(u).map((r) => <span className="role-chip" key={r.key}>{r.label}
      <button aria-label={`إزالة ${r.label}`} disabled={busy} onClick={() => void onAct(() => supabase.rpc("admin_set_user_role", { p_user: u.user_id, p_role: r.role, p_grant: false, p_school: r.school ?? null, p_region: null }), `أُزيل دور «${r.label}» من ${u.email}.`)}><X /></button></span>)}</div>}
    <p className="field-title">إضافة دور</p>
    <div className="claim-grid">
      <label htmlFor={`role-${u.user_id}`}>الدور<select id={`role-${u.user_id}`} value={role} onChange={(e) => setRole(e.target.value)}>{ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
      {needs === "region" && <label htmlFor={`region-${u.user_id}`}>المنطقة (المحافظة)<input id={`region-${u.user_id}`} value={region} onChange={(e) => setRegion(e.target.value)} /></label>}
    </div>
    {needs === "school" && <SchoolPick value={school} onChange={setSchool} />}
    {role === "super_admin" && <p className="muted-label">مدير النظام يملك كل الصلاحيات. امنحه لمن تثق به فقط.</p>}
    <div className="ops-actions"><Button size="sm" disabled={busy || (needs === "school" && !school) || (needs === "region" && !region.trim())}
      onClick={() => void onAct(() => supabase.rpc("admin_set_user_role", { p_user: u.user_id, p_role: role, p_grant: true, p_school: needs === "school" ? school?.id ?? null : null, p_region: needs === "region" ? region.trim() : null }), `أُضيف دور «${ROLE_OPTIONS.find((r) => r.value === role)?.label}» إلى ${u.email}.`)}><Check /> إضافة الدور</Button>
      <Button size="sm" variant="outline" onClick={onClose}>إغلاق</Button></div>
  </div>;
  if (mode === "suspend") return <div className="user-panel">
    <div className="claim-grid">
      <label htmlFor={`period-${u.user_id}`}>مدة الإيقاف<select id={`period-${u.user_id}`} value={period} onChange={(e) => setPeriod(e.target.value)}>{SUSPEND_FOR.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
      <label htmlFor={`reason-${u.user_id}`}>السبب<input id={`reason-${u.user_id}`} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    </div>
    <p className="muted-label">لا يستطيع صاحب الحساب الدخول أثناء الإيقاف، ويُسجَّل خروجه من كل أجهزته فورًا. الإيقاف المؤقت يُرفع تلقائيًا عند انتهاء المدة.</p>
    <div className="ops-actions"><Button size="sm" disabled={busy || !reason.trim()} onClick={() => { const h = SUSPEND_FOR.find((p) => p.value === period)?.hours ?? null; void onAct(async () => { const r = await supabase.rpc("admin_suspend_user", { p_user: u.user_id, p_until: h ? new Date(Date.now() + h * 3600000).toISOString() : null, p_note: reason.trim() }); if (!r.error) await supabase.rpc("admin_revoke_sessions", { p_user: u.user_id }); return r; }, `تم إيقاف ${u.email} ${h ? `لمدة ${SUSPEND_FOR.find((p) => p.value === period)?.label}` : "حتى إعادة تفعيله"}.`); }}>إيقاف</Button>
      <Button size="sm" variant="outline" onClick={onClose}>إلغاء</Button></div>
  </div>;
  return <div className="user-panel danger-panel">
    <p><strong>حذف الحساب نهائيًا لا يمكن التراجع عنه.</strong> يُحذف الحساب وإشعاراته وطلباته، وتبقى سجلات المدرسة (الطلاب والرحلات) دون ربط بالحساب.</p>
    <label htmlFor={`confirm-${u.user_id}`}>للتأكيد اكتب البريد: <span dir="ltr">{u.email}</span><input id={`confirm-${u.user_id}`} dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></label>
    <div className="ops-actions"><Button size="sm" className="danger-action" disabled={busy || confirm.trim().toLowerCase() !== u.email.toLowerCase()} onClick={() => void onAct(() => supabase.rpc("admin_delete_user", { p_user: u.user_id, p_confirm_email: confirm.trim() }), `حُذف الحساب ${u.email}.`)}><Trash2 /> حذف نهائي</Button>
      <Button size="sm" variant="outline" onClick={onClose}>إلغاء</Button></div>
  </div>;
}

export function UsersAdmin({ myEmail }: { myEmail: string }) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusF, setStatusF] = useState("");
  const [roleF, setRoleF] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ id: string; mode: "role" | "suspend" | "delete" | "tools" } | null>(null);
  const load = useCallback(async (q: string, st: string, rl: string) => {
    const { data, error } = await supabase.rpc("admin_users", { p_query: q.trim() || null, p_status: st || null, p_role: rl || null });
    if (error) { setMsg({ text: userErr(error.message), ok: false }); return; }
    setRows((data ?? []) as UserRow[]);
  }, []);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load("", "", "").catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [load]);
  const reload = () => load(query, statusF, roleF);
  const act = async (fn: () => PromiseLike<{ error: { message: string } | null }>, okText: string) => {
    setBusy(true); setMsg(null);
    const { error } = await fn();
    setBusy(false);
    if (error) { setMsg({ text: userErr(error.message), ok: false }); return; }
    setMsg({ text: okText, ok: true });
    if (okText.startsWith("حُذف") || okText.startsWith("تم إيقاف")) setOpen(null);
    await reload();
  };
  const counts = useMemo(() => ({ all: rows.length, suspended: rows.filter((r) => r.status === "suspended").length, pending: rows.filter((r) => r.status === "pending").length }), [rows]);

  return <>
    <div className="welcome"><div><p className="eyebrow">مدير النظام</p><h1>المستخدمون والصلاحيات</h1><p>كل الحسابات المسجلة: غيّر دور أي حساب، أو أوقفه مؤقتًا أو دائمًا، أو احذفه نهائيًا.</p></div></div>
    <Flash msg={msg} />
    <article className="panel ops-panel">
      <form className="users-filters" onSubmit={(e) => { e.preventDefault(); void reload(); }}>
        <input id="users-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="البريد أو الاسم أو الجوال" aria-label="بحث في المستخدمين" />
        <select aria-label="الحالة" value={statusF} onChange={(e) => { setStatusF(e.target.value); void load(query, e.target.value, roleF); }}><option value="">كل الحالات</option><option value="active">مفعّل</option><option value="pending">بانتظار التفعيل</option><option value="suspended">موقوف</option></select>
        <select aria-label="الدور" value={roleF} onChange={(e) => { setRoleF(e.target.value); void load(query, statusF, e.target.value); }}><option value="">كل الأدوار</option><option value="guardian">أولياء الأمور</option><option value="driver">السائقون</option><option value="school">إدارات المدارس</option><option value="executive">الإدارة التنفيذية</option><option value="super_admin">مدير النظام</option><option value="none">بلا دور</option></select>
        <Button type="submit" variant="outline"><Search /> بحث</Button>
      </form>
      <p className="muted-label">{counts.all} حساب · {counts.pending} بانتظار التفعيل · {counts.suspended} موقوف</p>
      {rows.map((u) => {
        const self = u.email.toLowerCase() === myEmail.toLowerCase();
        const chips = rolesOf(u);
        const isOpen = open?.id === u.user_id;
        return <div className="user-row" key={u.user_id}>
          <div className="ops-row">
            <div><strong dir="ltr">{u.email}</strong>{u.full_name && <span className="muted-inline"> · {u.full_name}</span>}{u.phone && <span className="muted-inline"> · <bdi>{u.phone}</bdi></span>}
              <p>{chips.length ? chips.map((c) => c.label).join(" — ") : "بلا دور"}</p>
              <p>سجّل {fmt(u.created_at)} · آخر دخول {fmt(u.last_sign_in_at)}{u.email_confirmed ? "" : " · البريد غير مؤكد"}{u.status === "suspended" ? ` · ${u.suspended_until ? `موقوف حتى ${fmt(u.suspended_until)}` : "موقوف حتى إعادة التفعيل"}` : ""}</p>
            </div>
            <div className="ops-actions">
              <Badge className={`status-badge ${u.status === "active" ? "tone-0" : u.status === "suspended" ? "tone-2" : "tone-1"}`}>{userStatus[u.status] ?? u.status}</Badge>
              {self ? <span className="muted-inline">حسابك</span> : <>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(isOpen && open?.mode === "role" ? null : { id: u.user_id, mode: "role" })}><ShieldCheck /> الدور</Button>
                {u.status === "suspended" ? <Button size="sm" disabled={busy} onClick={() => void act(() => supabase.rpc("admin_set_user_status", { p_user: u.user_id, p_status: "active", p_note: null }), `أُعيد تفعيل ${u.email}.`)}>إعادة تفعيل</Button>
                  : <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(isOpen && open?.mode === "suspend" ? null : { id: u.user_id, mode: "suspend" })}>إيقاف</Button>}
                {u.status === "pending" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => supabase.rpc("admin_set_user_status", { p_user: u.user_id, p_status: "active", p_note: null }), `تم تفعيل ${u.email}.`)}><Check /> تفعيل</Button>}
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(isOpen && open?.mode === "tools" ? null : { id: u.user_id, mode: "tools" })}>أدوات</Button>
                <Button size="sm" variant="outline" className="danger-outline" disabled={busy} aria-label={`حذف ${u.email}`} onClick={() => setOpen(isOpen && open?.mode === "delete" ? null : { id: u.user_id, mode: "delete" })}><Trash2 /></Button>
              </>}
            </div>
          </div>
          {isOpen && open && (open.mode === "tools" ? <UserTools user={u} onDone={(m) => { setMsg(m); void reload(); }} /> : <UserPanel key={open.mode} u={u} mode={open.mode} busy={busy} onAct={act} onClose={() => setOpen(null)} />)}
        </div>;
      })}
      {rows.length === 0 && <p className="muted-label">لا توجد حسابات مطابقة.</p>}
    </article>
    <TransferPanel />
  </>;
}

// ───────── إدارة البيانات: تعديل وحذف أي سجل ─────────
type Field = { key: string; label: string; type?: "number" | "date" | "time" | "bool" | "select"; options?: [string, string][] };
type TableDef = { id: string; label: string; title: string; search: string; fields: Field[] };
const TABLES: TableDef[] = [
  { id: "schools", label: "المدارس", title: "name", search: "name", fields: [
    { key: "name", label: "الاسم" }, { key: "region", label: "المنطقة" }, { key: "city", label: "المدينة" }, { key: "district", label: "الحي" },
    { key: "ministry_code", label: "الرقم الوزاري" }, { key: "phone", label: "الهاتف" }, { key: "email", label: "البريد" },
    { key: "status", label: "الحالة", type: "select", options: [["unclaimed", "غير مشتركة"], ["active", "مشتركة"], ["suspended", "موقوفة"], ["pending", "قيد المراجعة"]] },
    { key: "latitude", label: "خط العرض", type: "number" }, { key: "longitude", label: "خط الطول", type: "number" },
  ] },
  { id: "students", label: "الطلاب", title: "full_name", search: "full_name", fields: [
    { key: "full_name", label: "الاسم" }, { key: "grade", label: "الصف" }, { key: "class_name", label: "الفصل" }, { key: "home_address", label: "العنوان" },
    { key: "home_latitude", label: "خط عرض المنزل", type: "number" }, { key: "home_longitude", label: "خط طول المنزل", type: "number" },
    { key: "pickup_contact_phone", label: "جوال الاستلام" }, { key: "service_status", label: "حالة الخدمة", type: "select", options: [["pending", "بانتظار"], ["active", "نشط"], ["suspended", "موقوف"], ["inactive", "غير نشط"]] },
  ] },
  { id: "drivers", label: "السائقون", title: "full_name", search: "full_name", fields: [
    { key: "full_name", label: "الاسم" }, { key: "phone", label: "الجوال" }, { key: "email", label: "البريد" },
    { key: "license_number", label: "رقم الرخصة" }, { key: "license_expiry", label: "انتهاء الرخصة", type: "date" }, { key: "status", label: "الحالة", type: "select", options: [["pending", "بانتظار"], ["active", "نشط"], ["suspended", "موقوف"]] },
  ] },
  { id: "guardians", label: "أولياء الأمور", title: "full_name", search: "full_name", fields: [
    { key: "full_name", label: "الاسم" }, { key: "phone", label: "الجوال" }, { key: "email", label: "البريد" }, { key: "status", label: "الحالة", type: "select", options: [["pending", "بانتظار"], ["active", "نشط"], ["suspended", "موقوف"]] },
  ] },
  { id: "buses", label: "الباصات", title: "bus_number", search: "bus_number", fields: [
    { key: "bus_number", label: "رقم الباص" }, { key: "plate_number", label: "اللوحة" }, { key: "capacity", label: "السعة", type: "number" },
    { key: "status", label: "الحالة", type: "select", options: [["active", "يعمل"], ["maintenance", "صيانة"], ["inactive", "متوقف"]] }, { key: "notes", label: "ملاحظات" },
  ] },
  { id: "routes", label: "المسارات", title: "name", search: "name", fields: [
    { key: "name", label: "الاسم" }, { key: "direction", label: "الاتجاه", type: "select", options: [["to_school", "ذهاب"], ["to_home", "عودة"]] },
    { key: "scheduled_time", label: "الموعد", type: "time" }, { key: "estimated_duration_minutes", label: "المدة (دقيقة)", type: "number" }, { key: "is_active", label: "نشط", type: "bool" },
  ] },
  { id: "trips", label: "الرحلات", title: "trip_date", search: "status", fields: [
    { key: "trip_date", label: "التاريخ", type: "date" }, { key: "status", label: "الحالة", type: "select", options: [["scheduled", "مجدولة"], ["ready", "جاهزة"], ["in_progress", "جارية"], ["paused", "متوقفة مؤقتًا"], ["completed", "مكتملة"], ["cancelled", "ملغاة"], ["emergency", "طوارئ"]] }, { key: "notes", label: "ملاحظات" },
  ] },
];
type Row = Record<string, unknown> & { id: string; schools?: { name: string } | null };
const show = (v: unknown) => v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "نعم" : "لا") : String(v);

export function DataManager() {
  const [tableId, setTableId] = useState("schools");
  const def = useMemo(() => TABLES.find((t) => t.id === tableId) ?? TABLES[0], [tableId]);
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (t: TableDef, q: string) => {
    const cols = ["id", ...t.fields.map((f) => f.key), ...(t.id === "schools" ? [] : ["school_id", "schools(name)"])].join(",");
    let req = supabase.from(t.id).select(cols).order("created_at", { ascending: false }).limit(100);
    if (q.trim()) req = req.ilike(t.search, `%${q.trim()}%`);
    const { data, error } = await req;
    if (error) { setMsg({ text: errText(error.message), ok: false }); setRows([]); return; }
    setRows((data ?? []) as unknown as Row[]);
  }, []);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load(def, "").catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [def, load]);

  const startEdit = (r: Row) => { setConfirmDel(null); setEditing(r.id); setDraft(Object.fromEntries(def.fields.map((f) => [f.key, r[f.key] === null || r[f.key] === undefined ? "" : String(r[f.key])]))); };
  const save = async (r: Row) => {
    const patch = Object.fromEntries(def.fields.filter((f) => draft[f.key] !== (r[f.key] === null || r[f.key] === undefined ? "" : String(r[f.key]))).map((f) => [f.key, draft[f.key]]));
    if (!Object.keys(patch).length) { setEditing(null); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("admin_update_record", { p_table: def.id, p_id: r.id, p_patch: patch });
    setBusy(false);
    if (error) { setMsg({ text: errText(error.message), ok: false }); return; }
    setEditing(null); setMsg({ text: "تم حفظ التعديل وتسجيله في سجل التدقيق.", ok: true }); await load(def, query);
  };
  const remove = async (r: Row) => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("admin_delete_record", { p_table: def.id, p_id: r.id });
    setBusy(false); setConfirmDel(null);
    if (error) { setMsg({ text: errText(error.message), ok: false }); return; }
    setMsg({ text: "تم الحذف، ونسخة من السجل محفوظة في سجل التدقيق.", ok: true }); await load(def, query);
  };

  return <>
    <div className="welcome"><div><p className="eyebrow">مدير النظام</p><h1>إدارة البيانات</h1><p>تعديل أو حذف أي سجل في النظام. كل تعديل وحذف يُحفظ في سجل التدقيق مع القيم السابقة.</p></div></div>
    <Flash msg={msg} />
    <article className="panel ops-panel">
      <div className="dir-filters">
        {TABLES.map((t) => <button key={t.id} className={tableId === t.id ? "active" : ""} onClick={() => { setTableId(t.id); setEditing(null); setQuery(""); setMsg(null); }}>{t.label}</button>)}
        <form onSubmit={(e) => { e.preventDefault(); void load(def, query); }}><input id="data-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث" aria-label="بحث في السجلات" /><Button size="sm" type="submit" variant="outline"><Search /></Button></form>
      </div>
      {rows.length === 0 && <p className="muted-label">لا توجد سجلات.</p>}
      {rows.map((r) => <div className="ops-row data-row" key={r.id}>
        {editing === r.id ? <div className="data-edit">
          <div className="claim-grid">{def.fields.map((f) => <label key={f.key} htmlFor={`f-${f.key}`}>{f.label}
            {f.type === "select" ? <select id={`f-${f.key}`} value={draft[f.key]} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}>{f.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              : f.type === "bool" ? <select id={`f-${f.key}`} value={draft[f.key]} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}><option value="true">نعم</option><option value="false">لا</option></select>
              : <input id={`f-${f.key}`} type={f.type === "number" ? "text" : f.type ?? "text"} inputMode={f.type === "number" ? "decimal" : undefined} value={draft[f.key]} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))} />}
          </label>)}</div>
          <div className="ops-actions"><Button size="sm" disabled={busy} onClick={() => void save(r)}>حفظ</Button><Button size="sm" variant="outline" onClick={() => setEditing(null)}>إلغاء</Button></div>
        </div> : <>
          <div><strong>{show(r[def.title])}</strong><p>{[r.schools?.name, ...def.fields.filter((f) => f.key !== def.title).slice(0, 5).map((f) => `${f.label}: ${show(f.options?.find(([v]) => v === r[f.key])?.[1] ?? r[f.key])}`)].filter(Boolean).join(" · ")}</p></div>
          <div className="ops-actions">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => startEdit(r)}><Pencil /> تعديل</Button>
            {confirmDel === r.id ? <>{def.id === "schools" && <span className="danger-note">يحذف كل طلابها وباصاتها ومساراتها ورحلاتها</span>}<Button size="sm" className="danger-btn" disabled={busy} onClick={() => void remove(r)}>تأكيد الحذف</Button><Button size="sm" variant="outline" onClick={() => setConfirmDel(null)}>إلغاء</Button></>
              : <Button size="sm" variant="outline" disabled={busy} onClick={() => { setEditing(null); setConfirmDel(r.id); }}><Trash2 /> حذف</Button>}
          </div>
        </>}
      </div>)}
    </article>
  </>;
}

// ───────── سجل التدقيق ─────────
type AuditRow = { id: string; action: string; table_name: string; record_id: string | null; actor_id: string | null; old_values: unknown; new_values: unknown; created_at: string };
const tableText: Record<string, string> = { schools: "المدارس", students: "الطلاب", drivers: "السائقون", guardians: "أولياء الأمور", buses: "الباصات", routes: "المسارات", trips: "الرحلات", user_roles: "الصلاحيات", profiles: "الحسابات", school_claim_requests: "طلبات التفعيل", attendance_logs: "الحضور", "auth.users": "الحسابات" };
const actionText: Record<string, string> = {
  insert: "إضافة", update: "تعديل", delete: "حذف", login: "تسجيل دخول", admin_update: "تعديل من مدير النظام", admin_delete: "حذف من مدير النظام",
  school_activated: "تفعيل مدرسة", school_added: "إضافة مدرسة للدليل", school_status_note: "تغيير حالة مدرسة", role_granted: "منح صلاحية", role_revoked: "سحب صلاحية",
  user_status_note: "تغيير حالة حساب", trip_started: "بدء رحلة", trip_completed: "انتهاء رحلة", manual_attendance: "حضور يدوي",
  claim_contacting: "طلب تفعيل: جارٍ التواصل", claim_rejected: "طلب تفعيل: رفض", claim_accepted: "طلب تفعيل: قبول",
};

export function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [action, setAction] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async (a: string) => {
    let req = supabase.from("audit_logs").select("id,action,table_name,record_id,actor_id,old_values,new_values,created_at").order("created_at", { ascending: false }).limit(150);
    if (a) req = req.eq("action", a);
    const [{ data }, users] = await Promise.all([req, supabase.rpc("admin_list_users", { p_query: null })]);
    setRows((data ?? []) as unknown as AuditRow[]);
    setActors(Object.fromEntries(((users.data ?? []) as UserRow[]).map((u) => [u.user_id, u.email])));
  }, []);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load("").catch(() => {}); };
    void run();
    return () => { alive = false; };
  }, [load]);
  const filters: [string, string][] = [["", "الكل"], ["admin_update", "تعديلات المدير"], ["admin_delete", "حذف"], ["school_activated", "تفعيل مدارس"], ["role_granted", "صلاحيات"], ["trip_started", "رحلات"]];
  return <>
    <div className="welcome"><div><p className="eyebrow">مدير النظام</p><h1>سجل التدقيق</h1><p>آخر 150 عملية في النظام: من فعلها، ومتى، وعلى أي سجل، والقيم قبل التعديل وبعده.</p></div></div>
    <article className="panel ops-panel">
      <div className="dir-filters">{filters.map(([id, label]) => <button key={id} className={action === id ? "active" : ""} onClick={() => { setAction(id); void load(id); }}>{label}</button>)}</div>
      {rows.length === 0 && <p className="muted-label">لا توجد عمليات مسجلة.</p>}
      {rows.map((r) => <div className="ops-row audit-row" key={r.id}>
        <div><strong>{actionText[r.action] ?? r.action}</strong><p>{[tableText[r.table_name] ?? r.table_name, r.actor_id ? actors[r.actor_id] ?? "مستخدم" : "النظام"].filter(Boolean).join(" · ")} · {fmt(r.created_at)}</p>
          {open === r.id && <pre className="audit-json" dir="ltr">{JSON.stringify({ before: r.old_values, after: r.new_values }, null, 2)}</pre>}</div>
        {(r.old_values != null || r.new_values != null) && <Button size="sm" variant="outline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "إخفاء" : "التفاصيل"}</Button>}
      </div>)}
    </article>
  </>;
}


// ───────── الأعطال: أخطاء الواجهة عند المستخدمين، مجمّعة حسب الرسالة ─────────
type ErrorRow = { message: string; occurrences: number; users: number; first_seen: string; last_seen: string; sample_url: string | null; sample_stack: string | null; sample_agent: string | null };

export function ErrorLog() {
  const [days, setDays] = useState(7);
  const [rows, setRows] = useState<ErrorRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data } = await supabase.rpc("admin_error_summary", { p_days: days });
      if (alive) setRows((data ?? []) as ErrorRow[]);
    })().catch(() => setRows([]));
    return () => { alive = false; };
  }, [days]);
  return <>
    <div className="welcome"><div><p className="eyebrow">مدير النظام</p><h1>الأعطال</h1><p>الأخطاء التي ظهرت للمستخدمين في التطبيق، مجمّعة حسب الرسالة، مع عدد المرات والمتأثرين.</p></div></div>
    <article className="panel ops-panel">
      <div className="dir-filters">{[1, 7, 30].map((d) => <button key={d} className={days === d ? "active" : ""} onClick={() => setDays(d)}>{d === 1 ? "آخر يوم" : `آخر ${d} يومًا`}</button>)}</div>
      {rows && rows.length === 0 && <p className="muted-label">لا أعطال مسجلة في هذه الفترة.</p>}
      {rows?.map((r) => <div className="ops-row audit-row" key={r.message}>
        <div><strong dir="auto">{r.message}</strong><p>{r.occurrences} مرة · {r.users} مستخدم · آخر ظهور {fmt(r.last_seen)}{r.sample_url ? ` · ${r.sample_url}` : ""}</p>
          {open === r.message && <pre className="audit-json" dir="ltr">{[r.sample_agent, r.sample_stack].filter(Boolean).join("\n\n")}</pre>}</div>
        {(r.sample_stack || r.sample_agent) && <Button size="sm" variant="outline" onClick={() => setOpen(open === r.message ? null : r.message)}>{open === r.message ? "إخفاء" : "التفاصيل"}</Button>}
      </div>)}
    </article>
  </>;
}
