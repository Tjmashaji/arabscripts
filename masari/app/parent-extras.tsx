"use client";

import { useEffect, useState } from "react";
import { Bell, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

// ولي الأمر: اختيار أنواع التنبيهات، وسجل ملاحظاته مع رد المدرسة.
// تفضيلات التنبيهات يحترمها الخادم عند الإرسال (notify_student_guardians).

type Prefs = { bus_approaching: boolean; student_boarded: boolean; arrived_school: boolean; dropped_home: boolean; delays: boolean; emergencies: boolean };
const PREF_LABELS: [keyof Prefs, string, string][] = [
  ["bus_approaching", "اقتراب الباص", "قبل وصول الباص لمحطة ابنك"],
  ["student_boarded", "صعود الطالب", "عند صعوده الباص"],
  ["arrived_school", "الوصول للمدرسة", "عند وصوله المدرسة"],
  ["dropped_home", "النزول عند المنزل", "عند نزوله في رحلة العودة"],
  ["delays", "التأخير", "إذا تأخرت الرحلة عن موعدها"],
];
const DEFAULTS: Prefs = { bus_approaching: true, student_boarded: true, arrived_school: true, dropped_home: true, delays: true, emergencies: true };

export function NotificationPrefs() {
  const [uid, setUid] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const id = (await supabase.auth.getSession()).data.session?.user.id;
      if (!id || !alive) return;
      const { data } = await supabase.from("notification_preferences").select("bus_approaching,student_boarded,arrived_school,dropped_home,delays,emergencies").eq("user_id", id).maybeSingle();
      if (!alive) return;
      setUid(id); setPrefs({ ...DEFAULTS, ...(data ?? {}) } as Prefs);
    })().catch(() => {});
    return () => { alive = false; };
  }, []);
  const toggle = async (key: keyof Prefs) => {
    if (!uid || !prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); setMsg("");
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: uid, ...next }, { onConflict: "user_id" });
    if (error) { setPrefs(prefs); setMsg("تعذر الحفظ. حاول مرة أخرى."); return; }
    setMsg("حُفظت إعدادات التنبيهات.");
  };
  if (!prefs) return null;
  return <article className="panel ops-panel">
    <div className="panel-head"><div><p className="eyebrow">التنبيهات</p><h2>ما الذي يصلك عن رحلة ابنك</h2></div><Bell className="title-icon" /></div>
    {PREF_LABELS.map(([key, label, hint]) => <label className="pref-row" key={key}>
      <span><strong>{label}</strong><small>{hint}</small></span>
      <input type="checkbox" role="switch" checked={prefs[key]} onChange={() => void toggle(key)} aria-label={label} />
    </label>)}
    <label className="pref-row locked"><span><strong>الطوارئ</strong><small>تصلك دائمًا لسلامة ابنك</small></span><input type="checkbox" checked disabled aria-label="الطوارئ" /></label>
    {msg && <p className="muted-label">{msg}</p>}
  </article>;
}

type MyFeedback = { id: string; category: string | null; message: string; rating: number | null; status: string; reply: string | null; replied_at: string | null; created_at: string };
const statusText: Record<string, [string, string]> = { new: ["وصلت للمدرسة", "tone-1"], in_review: ["قيد المتابعة", "tone-1"], closed: ["تم الرد", "tone-0"] };
const fmt = (iso: string) => new Date(iso).toLocaleString("ar-SA-u-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" });

/** ملاحظات ولي الأمر السابقة من قاعدة البيانات (لا تختفي بعد إعادة الدخول) مع رد المدرسة. */
export function MyFeedbackList({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<MyFeedback[] | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const id = (await supabase.auth.getSession()).data.session?.user.id;
      if (!id) return;
      const { data } = await supabase.from("ratings_feedback").select("id,category,message,rating,status,reply,replied_at,created_at").eq("author_user_id", id).order("created_at", { ascending: false }).limit(10);
      if (alive) setRows((data ?? []) as MyFeedback[]);
    })().catch(() => {});
    return () => { alive = false; };
  }, [refreshKey]);
  if (!rows?.length) return null;
  return <div className="feedback-list">
    {rows.map((r) => <div className="feedback-item" key={r.id}>
      <div><strong><MessageSquareText className="inline-icon" /> {r.category ?? "ملاحظة"}{r.rating ? ` · ${r.rating} من 5` : ""}</strong><p>{r.message}</p><small>{fmt(r.created_at)}</small>
        {r.reply && <p className="feedback-reply"><strong>رد المدرسة:</strong> {r.reply}</p>}</div>
      <Badge className={`status-badge ${statusText[r.status]?.[1] ?? "tone-1"}`}>{statusText[r.status]?.[0] ?? r.status}</Badge>
    </div>)}
  </div>;
}
