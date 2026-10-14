"use client";

import { useEffect, useState } from "react";
import { Eye, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

// «الدخول كـ» لمدير النظام: يرى التطبيق كما تراه مدرسة أو سائق أو ولي أمر محدد، للدعم والتحقق.
// لا جلسة باسم المستخدم: القراءة بصلاحيات المدير، وكل دخول يُسجَّل في سجل التدقيق (admin_view_as).
// في وضع السائق وولي الأمر الشاشة للعرض فقط؛ في وضع المدرسة يعمل المدير كفريق المدرسة (والخادم يسجّل باسمه).

export type ViewAs =
  | { kind: "school"; schoolId: string; label: string; schoolName: string }
  | { kind: "driver"; driverId: string; schoolId: string; label: string; schoolName: string }
  | { kind: "parent"; userId: string; schoolId: string; label: string; schoolName: string };

// يقرؤه تحميل البيانات في page.tsx (خارج React)
let current: ViewAs | null = null;
export const currentViewAs = () => current;
export const setCurrentViewAs = (v: ViewAs | null) => { current = v; };

// المدرسة المختارة لمن يعمل في أكثر من مدرسة
const SCHOOL_KEY = "masari-school-ctx";
export type Membership = { school_id: string; role: string; status: string; school_status: string; school_name?: string };
export const activeMemberships = (list: Membership[] | undefined) => (list ?? []).filter((m) => m.status === "active" && m.school_status === "active");
export function pickSchool(list: Membership[] | undefined): Membership | null {
  const active = activeMemberships(list);
  let saved: string | null = null;
  try { saved = localStorage.getItem(SCHOOL_KEY); } catch { /* محجوب */ }
  return active.find((m) => m.school_id === saved) ?? active[0] ?? null;
}
export const saveSchoolChoice = (id: string) => { try { localStorage.setItem(SCHOOL_KEY, id); } catch { /* محجوب */ } };

type Kind = ViewAs["kind"];
type Hit = { id: string; title: string; sub: string };
const KIND_LABEL: Record<Kind, string> = { school: "مدرسة", driver: "سائق", parent: "ولي أمر" };

export function ViewAsPanel({ onPick }: { onPick: (v: ViewAs) => void }) {
  const [kind, setKind] = useState<Kind>("school");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const term = q.trim().replace(/[%,()]/g, "");
    const timer = window.setTimeout(async () => {
      const like = `%${term}%`;
      type Row = { id: string; full_name?: string; name?: string; email?: string | null; phone?: string | null; city?: string | null; schools?: { name: string } | { name: string }[] | null };
      const school = (r: Row) => (Array.isArray(r.schools) ? r.schools[0]?.name : r.schools?.name) ?? "";
      const res = kind === "school"
        ? await supabase.from("schools").select("id,name,city").eq("status", "active").ilike("name", like).order("name").limit(20)
        : kind === "driver"
          ? await supabase.from("drivers").select("id,full_name,phone,email,schools(name)").or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).order("full_name").limit(20)
          : await supabase.from("guardians").select("id,full_name,phone,email,schools(name)").not("user_id", "is", null).or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`).order("full_name").limit(20);
      if (!alive) return;
      const rows = (res.data ?? []) as Row[];
      setHits(rows.map((r) => kind === "school"
        ? { id: r.id, title: r.name ?? "", sub: r.city ?? "" }
        : { id: r.id, title: r.full_name ?? "", sub: [school(r), r.phone, r.email].filter(Boolean).join(" · ") }));
    }, 250);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [kind, q]);

  const pick = async (id: string) => {
    setBusy(true); setError("");
    const { data, error: e } = await supabase.rpc("admin_view_as", { p_kind: kind, p_target: id });
    setBusy(false);
    if (e || !data) { setError(e?.message?.includes("FORBIDDEN") ? "هذه الميزة لمدير النظام فقط." : "تعذر الدخول. حاول مرة أخرى."); return; }
    const d = data as { kind: Kind; school_id: string; school_name: string; label: string; driver_id?: string; user_id?: string };
    onPick(d.kind === "school" ? { kind: "school", schoolId: d.school_id, label: d.label, schoolName: d.school_name }
      : d.kind === "driver" ? { kind: "driver", driverId: d.driver_id!, schoolId: d.school_id, label: d.label, schoolName: d.school_name }
      : { kind: "parent", userId: d.user_id!, schoolId: d.school_id, label: d.label, schoolName: d.school_name });
  };

  return <article className="panel ops-panel view-as-panel">
    <div className="panel-head"><div><p className="eyebrow">الدعم الفني</p><h2>الدخول كـ مدرسة أو سائق أو ولي أمر</h2></div></div>
    <p className="muted-label">ترى التطبيق كما يراه صاحبه لتتحقق من مشكلة أو تساعده. كل دخول يُسجَّل في سجل التدقيق باسمك. شاشة السائق وولي الأمر للعرض فقط، وفي المدرسة تعمل كفريقها.</p>
    <div className="ops-actions">
      {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => { setKind(k); setHits([]); }}>{KIND_LABEL[k]}</Button>)}
      <label className="student-search"><Search /><input type="search" aria-label="بحث" placeholder={kind === "school" ? "اسم المدرسة" : "الاسم أو الجوال أو البريد"} value={q} onChange={(e) => setQ(e.target.value)} /></label>
    </div>
    {error && <p className="save-strip ops-message ops-error"><span>{error}</span></p>}
    {hits.length === 0 && <p className="muted-label">{kind === "parent" ? "يظهر أولياء الأمور المسجلون فقط." : "لا نتائج."}</p>}
    {hits.map((h) => <div className="ops-row" key={h.id}>
      <div><strong>{h.title}</strong><p>{h.sub}</p></div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void pick(h.id)}><Eye /> الدخول كـ{KIND_LABEL[kind]}</Button>
    </div>)}
  </article>;
}

export function ViewAsBanner({ viewAs, onExit }: { viewAs: ViewAs; onExit: () => void }) {
  return <div className="view-as-banner" role="status">
    <Eye /><span>تشاهد كـ{KIND_LABEL[viewAs.kind]}: <strong>{viewAs.label}</strong>{viewAs.kind !== "school" && ` (${viewAs.schoolName})`}{viewAs.kind !== "school" && <Badge variant="outline">للعرض فقط</Badge>}</span>
    <Button size="sm" onClick={onExit}>رجوع لمدير النظام</Button>
  </div>;
}
