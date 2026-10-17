"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Download, LifeBuoy, LogOut, Megaphone, Search, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { PUBLIC_SITE } from "@/lib/site";
import { useCaptcha } from "./captcha";

// أدوات مدير النظام: صحة النظام، الدعم الفني، الإعلانات، سجل التدقيق القابل للبحث، الإيرادات، أدوات الحسابات والنقل،
// ومن جهة المستخدم: تذاكر الدعم، شريط الإعلانات، وتنزيل بياناته. الصلاحيات يفرضها الخادم (admin_suite.sql).

type Msg = { text: string; ok: boolean } | null;
const Flash = ({ msg }: { msg: Msg }) => msg && <p className={`save-strip ops-message ${msg.ok ? "" : "ops-error"}`}><span>{msg.text}</span></p>;
const fmt = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }) : "—";
const sar = (n: number | string | null | undefined) => `${Number(n ?? 0).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;
const errText = (m = "") => m.includes("FORBIDDEN") ? "ليست لديك صلاحية لهذا الإجراء." : m.includes("RATE_LIMITED") ? "أرسلت تذاكر كثيرة خلال ساعة. حاول لاحقًا."
  : m.includes("DRIVER_HAS_TRIPS") ? "للسائق رحلات اليوم أو بعده؛ ألغها أو انقلها أولًا." : m.includes("DUPLICATE_STUDENT") ? "يوجد طالب بنفس البيانات في المدرسة الجديدة."
  : m.includes("SAME_ACCOUNT") ? "اختر حسابًا مختلفًا." : m.includes("CANNOT_CHANGE_SELF") ? "لا يمكنك تطبيق هذا على حسابك." : m.includes("NOT_FOUND") ? "غير موجود." : "تعذر التنفيذ. حاول مرة أخرى.";
const download = (name: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function useRun() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const run = async <T,>(fn: () => PromiseLike<{ data: T | null; error: { message?: string } | null }>, ok?: string | ((d: T) => string)) => {
    setBusy(true); setMsg(null);
    try {
      const { data, error } = await fn();
      if (error) { setMsg({ text: errText(error.message), ok: false }); return null; }
      if (ok) setMsg({ text: typeof ok === "string" ? ok : ok(data as T), ok: true });
      return (data ?? ({} as T)) as T;
    } finally { setBusy(false); }
  };
  return { busy, msg, setMsg, run };
}
function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [value, setValue] = useState<T | null>(null);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(deps);
  useEffect(() => {
    let alive = true;
    const go = async () => { const v = await fn().catch(() => null); if (alive && v !== null) setValue(v); };
    void go();
    return () => { alive = false; };
    // fn تُقرأ من آخر رسم؛ المفتاح والتحديث اليدوي هما ما يعيد التحميل
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const reload = () => setTick((t) => t + 1);
  return [value, reload] as const;
}

// ═════════ صحة النظام ═════════
type Health = {
  date: string; failed_messages_24h: number; client_errors_24h: number; open_emergencies: number; open_alerts: number; open_tickets: number; pending_claims: number;
  routes_without_trips: { school: string; route: string; reason: string }[];
  stale_trips: { trip_id: string; school: string; route: string; driver: string | null; last_seen: string | null }[];
  expiring: { kind: string; school: string; name: string; date: string }[];
};
const reasonText: Record<string, string> = {
  NOT_CREATED: "لم تُنشأ (الإنشاء التلقائي موقوف أو لم يحن)", NO_DRIVER: "بلا سائق", DRIVER_SUSPENDED: "السائق موقوف", NO_BUS: "بلا باص",
  NOT_ENOUGH_STOPS: "محطات غير كافية", STOP_HAS_NO_LOCATION: "محطة بلا موقع", NO_STUDENTS: "لا طلاب مسندين", BUS_IN_MAINTENANCE: "الباص في الصيانة",
  BUS_SERVICE_OVERDUE: "صيانة متأخرة", BUS_DOCS_EXPIRED: "وثائق الباص منتهية", DRIVER_LICENSE_EXPIRED: "رخصة السائق منتهية",
};
const kindText: Record<string, string> = { license: "رخصة سائق", registration: "استمارة", insurance: "تأمين", inspection: "فحص دوري" };

export function HealthPage({ onOpen }: { onOpen: (view: "support" | "control" | "errors" | "schools") => void }) {
  const [h, reload] = useLoad(async () => {
    const { data, error } = await supabase.rpc("admin_health");
    if (error || !data || Array.isArray(data)) throw error ?? new Error("EMPTY");
    const d = data as Health;
    return { ...d, routes_without_trips: d.routes_without_trips ?? [], stale_trips: d.stale_trips ?? [], expiring: d.expiring ?? [] };
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  const tiles: { label: string; value: number | undefined; warn: boolean; view?: "support" | "control" | "errors" | "schools" }[] = [
    { label: "مسارات بلا رحلة اليوم", value: h?.routes_without_trips.length, warn: Boolean(h?.routes_without_trips.length) },
    { label: "باصات انقطع موقعها", value: h?.stale_trips.length, warn: Boolean(h?.stale_trips.length), view: "control" },
    { label: "بلاغات مفتوحة", value: h?.open_emergencies, warn: Boolean(h?.open_emergencies), view: "control" },
    { label: "تنبيهات مسار", value: h?.open_alerts, warn: Boolean(h?.open_alerts), view: "control" },
    { label: "تذاكر دعم مفتوحة", value: h?.open_tickets, warn: Boolean(h?.open_tickets), view: "support" },
    { label: "رسائل فشلت (24 ساعة)", value: h?.failed_messages_24h, warn: Boolean(h?.failed_messages_24h), view: "errors" },
    { label: "أعطال التطبيق (24 ساعة)", value: h?.client_errors_24h, warn: (h?.client_errors_24h ?? 0) > 20, view: "errors" },
    { label: "طلبات تفعيل مدارس", value: h?.pending_claims, warn: false, view: "schools" },
  ];
  return <>
    <div className="welcome"><div><p className="eyebrow">مدير النظام · {h?.date ?? ""}</p><h1>صحة النظام</h1><p>ما يحتاج انتباهك اليوم قبل أن تتصل بك المدارس.</p></div>
      <Button variant="outline" onClick={() => void reload()}><Activity /> تحديث</Button></div>
    <div className="kpi-grid">{tiles.map((t) => <button key={t.label} className={`kpi-tile ${t.warn ? "warn" : ""}`} onClick={() => t.view && onOpen(t.view)}>
      <span className="kpi-value">{t.value ?? "…"}</span><span className="kpi-label">{t.label}</span></button>)}</div>
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">اليوم</p><h2>مسارات تعمل اليوم بلا رحلة</h2></div></div>
      {h && h.routes_without_trips.length === 0 && <p className="muted-label">كل المسارات العاملة اليوم لها رحلات.</p>}
      {h?.routes_without_trips.map((r, i) => <div className="ops-row" key={i}><div><strong>{r.route}</strong><p>{r.school}</p></div><Badge className="status-badge tone-1">{reasonText[r.reason] ?? r.reason}</Badge></div>)}
    </article>
    {h && h.stale_trips.length > 0 && <article className="panel ops-panel emergency-panel">
      <div className="panel-head"><div><p className="eyebrow">الآن</p><h2>رحلات جارية انقطع موقعها</h2></div><AlertTriangle className="title-icon" /></div>
      {h.stale_trips.map((t) => <div className="ops-row" key={t.trip_id}><div><strong>{t.route} · {t.school}</strong><p>{t.driver ?? "سائق"} · آخر موقع {fmt(t.last_seen)}</p></div></div>)}
    </article>}
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">خلال 30 يومًا</p><h2>رخص ووثائق تنتهي</h2></div></div>
      {h && h.expiring.length === 0 && <p className="muted-label">لا شيء ينتهي قريبًا.</p>}
      {h?.expiring.map((e, i) => <div className="ops-row" key={i}><div><strong>{kindText[e.kind] ?? e.kind} · {e.name}</strong><p>{e.school}</p></div>
        <Badge className={`status-badge ${e.date < today ? "tone-1" : "tone-2"}`}>{e.date < today ? "منتهية " : "تنتهي "}{e.date}</Badge></div>)}
    </article>
  </>;
}

// ═════════ الدعم الفني ═════════
type Ticket = { id: string; subject: string; category: string; status: string; created_at: string; updated_at: string; school_id: string | null; created_by: string };
type TicketMsg = { id: string; body: string; from_staff: boolean; created_at: string };
const catText: Record<string, string> = { general: "استفسار", bug: "مشكلة في التطبيق", account: "الحساب", billing: "الفواتير", upgrade: "ترقية الباقة", data: "البيانات والخصوصية" };
const ticketStatus: Record<string, [string, string]> = { open: ["بانتظار الرد", "tone-1"], answered: ["تم الرد", "tone-0"], closed: ["مغلقة", "tone-2"] };

function TicketThread({ ticket, staff, onChanged }: { ticket: Ticket; staff: boolean; onChanged: () => void }) {
  const [msgs, reload] = useLoad(async () => {
    const { data } = await supabase.from("support_ticket_messages").select("id,body,from_staff,created_at").eq("ticket_id", ticket.id).order("created_at");
    return (data ?? []) as TicketMsg[];
  }, [ticket.id]);
  const [body, setBody] = useState("");
  const { busy, msg, run } = useRun();
  const send = async () => {
    const r = await run(() => supabase.rpc("reply_ticket", { p_ticket: ticket.id, p_body: body.trim() }), "أُرسل الرد.");
    if (r) { setBody(""); void reload(); onChanged(); }
  };
  return <div className="ticket-thread">
    <Flash msg={msg} />
    {msgs?.map((m) => <div key={m.id} className={`ticket-msg ${m.from_staff ? "staff" : ""}`}><strong>{m.from_staff ? "الدعم الفني" : "صاحب التذكرة"}</strong><p>{m.body}</p><small>{fmt(m.created_at)}</small></div>)}
    {ticket.status !== "closed" && <>
      <textarea aria-label="الرد" value={body} onChange={(e) => setBody(e.target.value)} placeholder={staff ? "اكتب ردك…" : "أضف تفاصيل أو ردًا…"} />
      <div className="ops-actions">
        <Button size="sm" disabled={busy || !body.trim()} onClick={() => void send()}><Send /> إرسال</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => supabase.rpc("set_ticket_status", { p_ticket: ticket.id, p_status: "closed" }), "أُغلقت التذكرة.").then((r) => { if (r) onChanged(); })}>إغلاق التذكرة</Button>
      </div>
    </>}
    {ticket.status === "closed" && staff && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => supabase.rpc("set_ticket_status", { p_ticket: ticket.id, p_status: "open" }), "أُعيد فتح التذكرة.").then((r) => { if (r) onChanged(); })}>إعادة فتح</Button>}
  </div>;
}

export function SupportAdmin() {
  const [status, setStatus] = useState("open");
  const [open, setOpen] = useState<string | null>(null);
  const [rows, reload] = useLoad(async () => {
    let q = supabase.from("support_tickets").select("id,subject,category,status,created_at,updated_at,school_id,created_by,schools(name)").order("updated_at", { ascending: false }).limit(200);
    if (status) q = q.eq("status", status);
    const { data } = await q;
    return (data ?? []) as unknown as (Ticket & { schools: { name: string } | null })[];
  }, [status]);
  return <>
    <div className="welcome"><div><p className="eyebrow">مدير النظام</p><h1>الدعم الفني</h1><p>تذاكر المدارس والسائقين وأولياء الأمور. ردك يصل صاحب التذكرة إشعارًا.</p></div></div>
    <article className="panel ops-panel">
      <div className="dir-filters">{[["open", "بانتظار الرد"], ["answered", "تم الرد"], ["closed", "مغلقة"], ["", "الكل"]].map(([id, l]) => <button key={id} className={status === id ? "active" : ""} onClick={() => setStatus(id)}>{l}</button>)}</div>
      {rows && rows.length === 0 && <p className="muted-label">لا توجد تذاكر هنا.</p>}
      {rows?.map((t) => <div className="user-row" key={t.id}>
        <div className="ops-row"><div><strong>{t.subject}</strong><p>{[catText[t.category] ?? t.category, t.schools?.name, `آخر تحديث ${fmt(t.updated_at)}`].filter(Boolean).join(" · ")}</p></div>
          <div className="ops-actions"><Badge className={`status-badge ${ticketStatus[t.status]?.[1]}`}>{ticketStatus[t.status]?.[0]}</Badge>
            <Button size="sm" variant="outline" onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? "إغلاق" : "فتح"}</Button></div></div>
        {open === t.id && <TicketThread ticket={t} staff onChanged={() => void reload()} />}
      </div>)}
    </article>
  </>;
}

export function MySupport({ schoolId, defaultCategory = "general", defaultSubject = "" }: { schoolId?: string | null; defaultCategory?: string; defaultSubject?: string }) {
  const [form, setForm] = useState({ subject: defaultSubject, category: defaultCategory, body: "" });
  const [open, setOpen] = useState<string | null>(null);
  const { busy, msg, run } = useRun();
  const [rows, reload] = useLoad(async () => {
    const uid = (await supabase.auth.getSession()).data.session?.user.id;
    if (!uid) return [] as Ticket[];
    const { data } = await supabase.from("support_tickets").select("id,subject,category,status,created_at,updated_at,school_id,created_by").eq("created_by", uid).order("updated_at", { ascending: false });
    return (data ?? []) as Ticket[];
  }, []);
  const submit = async () => {
    const r = await run(() => supabase.rpc("open_ticket", { p_subject: form.subject.trim(), p_category: form.category, p_body: form.body.trim(), p_school: schoolId ?? null }), "وصلت تذكرتك للدعم الفني، وسيصلك الرد إشعارًا.");
    if (r) { setForm({ subject: "", category: "general", body: "" }); void reload(); }
  };
  return <>
    <div className="welcome"><div><p className="eyebrow">مساري</p><h1>الدعم الفني</h1><p>اكتب مشكلتك أو سؤالك، ويرد عليك فريق مساري هنا.</p></div><LifeBuoy className="title-icon" /></div>
    <Flash msg={msg} />
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">تذكرة جديدة</p><h2>تواصل معنا</h2></div></div>
      <div className="claim-grid">
        <label>الموضوع<input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="مثال: الطالب لا يظهر في الرحلة" /></label>
        <label>النوع<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{Object.entries(catText).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="wide-field">التفاصيل<textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="ماذا حدث؟ ومتى؟ وما الذي توقعته؟" /></label>
      </div>
      <Button className="wide-action" disabled={busy || form.subject.trim().length < 3 || !form.body.trim()} onClick={() => void submit()}><Send /> إرسال للدعم الفني</Button>
    </article>
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">تذاكري</p><h2>المحادثات السابقة</h2></div></div>
      {rows && rows.length === 0 && <p className="muted-label">لا توجد تذاكر بعد.</p>}
      {rows?.map((t) => <div className="user-row" key={t.id}>
        <div className="ops-row"><div><strong>{t.subject}</strong><p>{catText[t.category] ?? t.category} · {fmt(t.updated_at)}</p></div>
          <div className="ops-actions"><Badge className={`status-badge ${ticketStatus[t.status]?.[1]}`}>{ticketStatus[t.status]?.[0]}</Badge>
            <Button size="sm" variant="outline" onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? "إغلاق" : "فتح"}</Button></div></div>
        {open === t.id && <TicketThread ticket={t} staff={false} onChanged={() => void reload()} />}
      </div>)}
    </article>
  </>;
}

// ═════════ الإعلانات ═════════
type Announcement = { id: string; title: string; body: string; audience: string; region: string | null; tone: string; starts_at: string; ends_at: string | null };
const audienceText: Record<string, string> = { all: "الجميع", school: "إدارات المدارس", driver: "السائقون", parent: "أولياء الأمور" };

export function AnnouncementsAdmin() {
  const empty = { title: "", body: "", audience: "all", region: "", tone: "info", days: "3", notify: true };
  const [form, setForm] = useState(empty);
  const { busy, msg, run } = useRun();
  const [rows, reload] = useLoad(async () => {
    const { data } = await supabase.from("announcements").select("id,title,body,audience,region,tone,starts_at,ends_at").order("starts_at", { ascending: false }).limit(50);
    return (data ?? []) as Announcement[];
  }, []);
  const post = async () => {
    const days = Number(form.days);
    const r = await run<{ notified: number }>(() => supabase.rpc("admin_post_announcement", { p_title: form.title.trim(), p_body: form.body.trim(), p_audience: form.audience,
      p_region: form.region.trim() || null, p_tone: form.tone, p_ends_at: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null, p_notify: form.notify }),
      (d) => form.notify ? `نُشر الإعلان ووصل إشعارًا لـ ${d.notified} حساب.` : "نُشر الإعلان كشريط داخل التطبيق.");
    if (r) { setForm(empty); void reload(); }
  };
  const [now] = useState(() => Date.now());
  const active = (a: Announcement) => !a.ends_at || new Date(a.ends_at).getTime() > now;
  return <>
    <div className="welcome"><div><p className="eyebrow">مدير النظام</p><h1>الإعلانات</h1><p>رسالة لكل المستخدمين أو لفئة أو منطقة: تصل إشعارًا وتظهر شريطًا أعلى التطبيق حتى تنتهي.</p></div><Megaphone className="title-icon" /></div>
    <Flash msg={msg} />
    <article className="panel ops-panel">
      <div className="claim-grid">
        <label>العنوان<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="مثال: صيانة مجدولة الليلة" /></label>
        <label>الفئة<select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>{Object.entries(audienceText).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>المنطقة (فارغ = كل المناطق)<input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="الخرج" /></label>
        <label>النوع<select value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}><option value="info">معلومة</option><option value="warning">تنبيه مهم</option></select></label>
        <label>يظهر لمدة (أيام، 0 = حتى تنهيه)<input inputMode="numeric" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /></label>
        <label className="planner-check"><input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} /> إرسال إشعار أيضًا</label>
        <label className="wide-field">النص<textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></label>
      </div>
      <Button className="wide-action" disabled={busy || form.title.trim().length < 3 || form.body.trim().length < 3} onClick={() => void post()}><Megaphone /> نشر الإعلان</Button>
    </article>
    <article className="panel ops-panel">
      <div className="panel-head"><div><p className="eyebrow">السجل</p><h2>الإعلانات السابقة</h2></div></div>
      {rows && rows.length === 0 && <p className="muted-label">لا توجد إعلانات بعد.</p>}
      {rows?.map((a) => <div className="ops-row" key={a.id}><div><strong>{a.title}</strong><p>{[audienceText[a.audience], a.region, fmt(a.starts_at), a.ends_at ? `حتى ${fmt(a.ends_at)}` : "بلا نهاية"].filter(Boolean).join(" · ")}</p><p>{a.body}</p></div>
        <div className="ops-actions"><Badge className={`status-badge ${active(a) ? "tone-0" : "tone-2"}`}>{active(a) ? "ظاهر" : "انتهى"}</Badge>
          {active(a) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => supabase.rpc("admin_end_announcement", { p_id: a.id }), "أُنهي الإعلان.").then((r) => { if (r) void reload(); })}>إنهاء</Button>}</div></div>)}
    </article>
  </>;
}

const DISMISS_KEY = "masari-dismissed-announcements";
const dismissed = (): string[] => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]") as string[]; } catch { return []; } };
export function AnnouncementBanner() {
  const [items, setItems] = useState<{ id: string; title: string; body: string; tone: string }[]>([]);
  useEffect(() => {
    let alive = true;
    const go = async () => {
      const { data } = await supabase.rpc("my_announcements");
      if (alive) setItems(((data ?? []) as { id: string; title: string; body: string; tone: string }[]).filter((a) => !dismissed().includes(a.id)));
    };
    void go().catch(() => {});
    return () => { alive = false; };
  }, []);
  const hide = (id: string) => { try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...dismissed(), id].slice(-50))); } catch { /* محجوب */ } setItems((x) => x.filter((a) => a.id !== id)); };
  if (!items.length) return null;
  return <>{items.map((a) => <div key={a.id} className={`announcement-banner ${a.tone === "warning" ? "warn" : ""}`} role="status">
    <Megaphone /><span><strong>{a.title}</strong> {a.body}</span><button aria-label="إخفاء الإعلان" onClick={() => hide(a.id)}><X /></button></div>)}</>;
}

// ═════════ سجل التدقيق القابل للبحث ═════════
type AuditRow = { id: string; created_at: string; action: string; table_name: string | null; record_id: string | null; actor_email: string | null; school_name: string | null; old_values: unknown; new_values: unknown };
const actionText: Record<string, string> = {
  login: "دخول", admin_update: "تعديل من المدير", admin_delete: "حذف من المدير", school_activated: "تفعيل مدرسة", role_granted: "منح دور", role_revoked: "سحب دور",
  admin_view_as: "الدخول كـ", data_export: "تصدير بيانات", sessions_revoked: "تسجيل خروج من الأجهزة", accounts_merged: "دمج حسابات", driver_transferred: "نقل سائق",
  student_transferred: "نقل طالب", announcement: "إعلان", subscription_set: "اشتراك", student_status: "حالة طالب", driver_status: "حالة سائق", import_students: "استيراد طلاب",
  create_today_trips: "إنشاء رحلات", trip_started: "بدء رحلة", account_deleted: "حذف حساب",
};
const csvCell = (v: unknown) => { const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function AuditSearch() {
  const [f, setF] = useState({ actor: "", action: "", from: "", to: "" });
  const [open, setOpen] = useState<string | null>(null);
  const { busy, msg, run } = useRun();
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const search = useCallback(async (q: typeof f) => {
    const { data, error } = await supabase.rpc("admin_audit_search", { p_actor: q.actor.trim() || null, p_school: null, p_action: q.action || null, p_from: q.from || null, p_to: q.to || null, p_limit: 500 });
    if (!error) setRows((data ?? []) as AuditRow[]);
  }, []);
  useEffect(() => {
    let alive = true;
    const go = async () => { if (alive) await search({ actor: "", action: "", from: "", to: "" }); };
    void go();
    return () => { alive = false; };
  }, [search]);
  const exportCsv = () => {
    if (!rows) return;
    const head = ["التاريخ", "الإجراء", "المستخدم", "المدرسة", "الجدول", "السجل", "قبل", "بعد"];
    const lines = rows.map((r) => [r.created_at, actionText[r.action] ?? r.action, r.actor_email ?? "النظام", r.school_name, r.table_name, r.record_id, r.old_values, r.new_values].map(csvCell).join(","));
    download(`masari-audit-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + [head.join(","), ...lines].join("\r\n"), "text/csv;charset=utf-8");
  };
  return <>
    <div className="welcome"><div><p className="eyebrow">مدير النظام</p><h1>سجل التدقيق</h1><p>من فعل ماذا ومتى، مع البحث بالمستخدم ونوع الإجراء والتاريخ، والتصدير لملف.</p></div></div>
    <Flash msg={msg} />
    <article className="panel ops-panel">
      <form className="users-filters" onSubmit={(e) => { e.preventDefault(); void run(async () => { await search(f); return { data: true, error: null }; }); }}>
        <input aria-label="المستخدم" value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value })} placeholder="بريد المستخدم" />
        <select aria-label="الإجراء" value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}><option value="">كل الإجراءات</option>{Object.entries(actionText).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input aria-label="من تاريخ" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <input aria-label="إلى تاريخ" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <Button type="submit" variant="outline" disabled={busy}><Search /> بحث</Button>
        <Button type="button" variant="outline" disabled={!rows?.length} onClick={exportCsv}><Download /> تصدير CSV</Button>
      </form>
      <p className="muted-label">{rows ? `${rows.length} عملية` : "…"}</p>
      {rows?.map((r) => <div className="ops-row audit-row" key={r.id}>
        <div><strong>{actionText[r.action] ?? r.action}</strong><p>{[r.actor_email ?? "النظام", r.school_name, r.table_name, fmt(r.created_at)].filter(Boolean).join(" · ")}</p>
          {open === r.id && <pre className="audit-json" dir="ltr">{JSON.stringify({ record: r.record_id, before: r.old_values, after: r.new_values }, null, 2)}</pre>}</div>
        {(r.old_values != null || r.new_values != null) && <Button size="sm" variant="outline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "إخفاء" : "التفاصيل"}</Button>}
      </div>)}
    </article>
  </>;
}

// ═════════ الإيرادات ═════════
type Revenue = { mrr: number; due_total: number; overdue_total: number; paid_this_month: number;
  overdue: { number: string; school: string; total: number; due_date: string }[]; expiring: { school: string; ends_on: string; status: string }[];
  near_limit: { school: string; students: number; max_students: number | null; buses: number; max_buses: number | null }[] };
export function RevenuePanel() {
  const [r] = useLoad(async () => { const { data, error } = await supabase.rpc("admin_revenue"); if (error || !data || Array.isArray(data)) throw error ?? new Error("EMPTY"); const d = data as Revenue; return { ...d, overdue: d.overdue ?? [], expiring: d.expiring ?? [], near_limit: d.near_limit ?? [] }; }, []);
  if (!r) return null;
  return <>
    <div className="kpi-grid">
      <div className="kpi-tile"><span className="kpi-value">{sar(r.mrr)}</span><span className="kpi-label">الإيراد الشهري المتكرر</span></div>
      <div className="kpi-tile"><span className="kpi-value">{sar(r.paid_this_month)}</span><span className="kpi-label">محصّل هذا الشهر</span></div>
      <div className={`kpi-tile ${r.due_total ? "warn" : ""}`}><span className="kpi-value">{sar(r.due_total)}</span><span className="kpi-label">كل الفواتير المستحقة</span></div>
      <div className={`kpi-tile ${r.overdue_total ? "warn" : ""}`}><span className="kpi-value">{sar(r.overdue_total)}</span><span className="kpi-label">متأخرة عن موعدها</span></div>
    </div>
    {(r.overdue.length > 0 || r.expiring.length > 0 || r.near_limit.length > 0) && <article className="panel ops-panel emergency-panel">
      <div className="panel-head"><div><p className="eyebrow">تحتاج متابعة</p><h2>الاشتراكات والفواتير</h2></div></div>
      {r.overdue.map((i) => <div className="ops-row" key={i.number}><div><strong>فاتورة متأخرة <span dir="ltr">{i.number}</span> · {i.school}</strong><p>{sar(i.total)} · كانت تستحق {i.due_date}</p></div><Badge className="status-badge tone-1">متأخرة</Badge></div>)}
      {r.expiring.map((e) => <div className="ops-row" key={e.school + e.ends_on}><div><strong>اشتراك ينتهي · {e.school}</strong><p>ينتهي {e.ends_on}. وصل تنبيه لمدير المدرسة.</p></div><Badge className="status-badge tone-2">قريبًا</Badge></div>)}
      {r.near_limit.map((n) => <div className="ops-row" key={n.school}><div><strong>قرب حد الباقة · {n.school}</strong><p>{n.students}{n.max_students ? ` من ${n.max_students}` : ""} طالب · {n.buses}{n.max_buses ? ` من ${n.max_buses}` : ""} باص</p></div><Badge className="status-badge tone-1">ترقية؟</Badge></div>)}
    </article>}
  </>;
}

// ═════════ أدوات الحساب (داخل صفحة المستخدمين) ═════════
export function UserTools({ user, onDone }: { user: { user_id: string; email: string; email_confirmed: boolean }; onDone: (m: { text: string; ok: boolean }) => void }) {
  const [into, setInto] = useState("");
  const { busy, run } = useRun();
  const done = (text: string, ok = true) => onDone({ text, ok });
  // عند تفعيل التحقق في Supabase تحتاج هذه الطلبات رمز تحقق أيضًا
  const captcha = useCaptcha();
  const reset = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: PUBLIC_SITE, captchaToken: captcha.token }); captcha.reset();
    done(error ? "تعذر إرسال رابط كلمة المرور." : `أُرسل رابط تعيين كلمة المرور إلى ${user.email}.`, !error);
  };
  const resend = async () => {
    const { error } = await supabase.auth.resend({ type: "signup", email: user.email, options: { emailRedirectTo: PUBLIC_SITE, captchaToken: captcha.token } }); captcha.reset();
    done(error ? "تعذر إعادة إرسال رابط التفعيل." : `أُعيد إرسال رابط التفعيل إلى ${user.email}.`, !error);
  };
  const revoke = async () => {
    const r = await run<number>(() => supabase.rpc("admin_revoke_sessions", { p_user: user.user_id }));
    if (r !== null) done(`سُجّل خروج ${user.email} من كل الأجهزة.`); else done("تعذر تسجيل الخروج.", false);
  };
  const merge = async () => {
    const { data } = await supabase.rpc("admin_users", { p_query: into.trim(), p_status: null, p_role: null });
    const target = ((data ?? []) as { user_id: string; email: string }[]).find((u) => u.email.toLowerCase() === into.trim().toLowerCase());
    if (!target) { done("لم نجد حسابًا بهذا البريد.", false); return; }
    if (!window.confirm(`نقل كل ارتباطات ${user.email} إلى ${target.email} ثم إيقاف ${user.email}؟`)) return;
    const r = await run<{ schools: number; drivers: number; guardians: number; roles: number }>(() => supabase.rpc("admin_merge_accounts", { p_from: user.user_id, p_into: target.user_id }));
    if (r) done(`دُمج الحساب: ${r.schools} مدرسة، ${r.drivers} سائق، ${r.guardians} ولي أمر، ${r.roles} دور. أُوقف ${user.email}.`); else done("تعذر الدمج.", false);
  };
  return <div className="user-panel">
    <p className="field-title">أدوات الحساب</p>
    <div className="ops-actions">
      {captcha.widget}
      <Button size="sm" variant="outline" disabled={busy || !captcha.ready} onClick={() => void reset()}><Send /> رابط تعيين كلمة المرور</Button>
      {!user.email_confirmed && <Button size="sm" variant="outline" disabled={busy || !captcha.ready} onClick={() => void resend()}><Send /> إعادة إرسال التفعيل</Button>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void revoke()}><LogOut /> خروج من كل الأجهزة</Button>
    </div>
    <p className="field-title">دمج حساب مكرر</p>
    <p className="muted-label">تنتقل مدارس هذا الحساب وسجل السائق وأبناؤه وأدواره إلى الحساب الآخر، ثم يُوقف هذا الحساب.</p>
    <div className="ops-actions"><input className="ops-coords" dir="ltr" aria-label="بريد الحساب الأساسي" placeholder="بريد الحساب الأساسي" value={into} onChange={(e) => setInto(e.target.value)} />
      <Button size="sm" variant="outline" disabled={busy || !into.includes("@")} onClick={() => void merge()}>دمج فيه</Button></div>
  </div>;
}

// ═════════ نقل سائق أو طالب بين المدارس ═════════
type Pick = { id: string; title: string; sub: string };
export function TransferPanel() {
  const [kind, setKind] = useState<"driver" | "student">("driver");
  const [q, setQ] = useState(""); const [hits, setHits] = useState<Pick[]>([]); const [item, setItem] = useState<Pick | null>(null);
  const [sq, setSq] = useState(""); const [schools, setSchools] = useState<Pick[]>([]); const [school, setSchool] = useState<Pick | null>(null);
  const { busy, msg, run } = useRun();
  const find = async () => {
    const like = `%${q.trim().replace(/[%,()]/g, "")}%`;
    const { data } = kind === "driver"
      ? await supabase.from("drivers").select("id,full_name,phone,schools(name)").ilike("full_name", like).limit(15)
      : await supabase.from("students").select("id,full_name,grade,schools(name)").ilike("full_name", like).limit(15);
    type R = { id: string; full_name: string; phone?: string | null; grade?: string | null; schools: { name: string } | { name: string }[] | null };
    setHits(((data ?? []) as R[]).map((r) => ({ id: r.id, title: r.full_name, sub: [(Array.isArray(r.schools) ? r.schools[0]?.name : r.schools?.name), r.phone ?? r.grade].filter(Boolean).join(" · ") })));
  };
  const findSchool = async () => {
    const { data } = await supabase.from("schools").select("id,name,city").eq("status", "active").ilike("name", `%${sq.trim().replace(/[%,()]/g, "")}%`).limit(15);
    setSchools(((data ?? []) as { id: string; name: string; city: string | null }[]).map((s) => ({ id: s.id, title: s.name, sub: s.city ?? "" })));
  };
  const go = async () => {
    if (!item || !school || !window.confirm(`نقل ${item.title} إلى ${school.title}؟`)) return;
    const r = await run(() => supabase.rpc(kind === "driver" ? "admin_transfer_driver" : "admin_transfer_student", kind === "driver" ? { p_driver: item.id, p_school: school.id } : { p_student: item.id, p_school: school.id }),
      kind === "driver" ? `نُقل ${item.title} إلى ${school.title} وفُك من باصاته ومساراته القديمة.` : `نُقل ${item.title} إلى ${school.title} مع أولياء أمره. أسنده لمسار في مدرسته الجديدة.`);
    if (r) { setItem(null); setHits([]); }
  };
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">المدارس</p><h2>نقل سائق أو طالب بين المدارس</h2></div></div>
    <Flash msg={msg} />
    <div className="ops-actions">
      <Button size="sm" variant={kind === "driver" ? "default" : "outline"} onClick={() => { setKind("driver"); setItem(null); setHits([]); }}>سائق</Button>
      <Button size="sm" variant={kind === "student" ? "default" : "outline"} onClick={() => { setKind("student"); setItem(null); setHits([]); }}>طالب</Button>
      <input className="ops-coords" aria-label="الاسم" placeholder="الاسم" value={q} onChange={(e) => setQ(e.target.value)} />
      <Button size="sm" variant="outline" onClick={() => void find()}><Search /> بحث</Button>
    </div>
    {!item && hits.map((h) => <div className="ops-row" key={h.id}><div><strong>{h.title}</strong><p>{h.sub}</p></div><Button size="sm" variant="outline" onClick={() => setItem(h)}>اختيار</Button></div>)}
    {item && <>
      <p className="ops-subhead">نقل <strong>{item.title}</strong> ({item.sub}) إلى:</p>
      <div className="ops-actions"><input className="ops-coords" aria-label="المدرسة الجديدة" placeholder="اسم المدرسة الجديدة" value={sq} onChange={(e) => setSq(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => void findSchool()}><Search /> بحث</Button><Button size="sm" variant="outline" onClick={() => setItem(null)}>تغيير</Button></div>
      {schools.map((s) => <div className="ops-row" key={s.id}><div><strong>{s.title}</strong><p>{s.sub}</p></div>
        <Button size="sm" variant={school?.id === s.id ? "default" : "outline"} onClick={() => setSchool(s)}>{school?.id === s.id ? "مختارة" : "اختيار"}</Button></div>)}
      <Button className="wide-action" disabled={busy || !school} onClick={() => void go()}>تنفيذ النقل</Button>
    </>}
  </article>;
}

// ═════════ تنزيل بياناتي (صفحة الحساب) ═════════
export function ExportMyData() {
  const { busy, msg, run } = useRun();
  const go = async () => {
    const d = await run<unknown>(() => supabase.rpc("export_my_data"), "نُزّل ملف بياناتك.");
    if (d) download(`masari-my-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 2), "application/json");
  };
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">الخصوصية</p><h2>تنزيل بياناتي</h2></div></div>
    <p className="muted-label">ملف بكل ما يحفظه مساري عنك: الحساب والأدوار والأبناء والإشعارات وتذاكر الدعم (حق الوصول في نظام حماية البيانات الشخصية).</p>
    <Flash msg={msg} />
    <Button variant="outline" disabled={busy} onClick={() => void go()}><Download /> تنزيل بياناتي</Button>
  </article>;
}
