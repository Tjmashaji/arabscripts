"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// محادثة مختصرة بين ولي الأمر والمدرسة بدل الاتصالات.

type Msg = { id: string; from_school: boolean; body: string; created_at: string; read_at: string | null };
const timeOf = (iso: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(iso));

function Thread({ schoolId, guardianUser, asSchool, title }: { schoolId: string; guardianUser: string; asSchool: boolean; title: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("school_messages").select("id,from_school,body,created_at,read_at").eq("school_id", schoolId).eq("guardian_user", guardianUser).order("created_at").limit(200);
    setMsgs((data ?? []) as Msg[]);
    await supabase.rpc("mark_thread_read", { p_school: schoolId, p_guardian: guardianUser });
  }, [schoolId, guardianUser]);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => {}); };
    void run(); const t = window.setInterval(() => void run(), 20000);
    const ch = supabase.channel(`chat-${schoolId}-${guardianUser}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "school_messages", filter: `guardian_user=eq.${guardianUser}` }, () => void run()).subscribe();
    return () => { alive = false; window.clearInterval(t); void supabase.removeChannel(ch); };
  }, [load, schoolId, guardianUser]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);
  const send = async () => {
    const body = text.trim(); if (!body) return;
    setBusy(true); setErr("");
    const { error } = await supabase.from("school_messages").insert({ school_id: schoolId, guardian_user: guardianUser, from_school: asSchool, body });
    setBusy(false);
    if (error) { setErr("تعذر الإرسال. حاول مرة أخرى."); return; }
    setText(""); await load();
  };
  return <article className="panel ops-panel chat-panel">
    <div className="panel-head"><div><p className="eyebrow">محادثة</p><h2>{title}</h2></div><MessageCircle className="title-icon" /></div>
    <div className="chat-list">
      {msgs.length === 0 && <p className="muted-label">لا توجد رسائل بعد. اكتب سؤالك أو ملاحظتك، ويصل للطرف الآخر إشعار.</p>}
      {msgs.map((m) => { const mine = m.from_school === asSchool; return <div key={m.id} className={`chat-msg ${mine ? "mine" : "theirs"}`}><p>{m.body}</p><small>{timeOf(m.created_at)}{mine && m.read_at ? " · قُرئت" : ""}</small></div>; })}
      <div ref={end} />
    </div>
    {err && <p className="auth-message">{err}</p>}
    <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={2} placeholder="اكتب رسالتك…" aria-label="نص الرسالة" onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
      <Button type="submit" disabled={busy || !text.trim()} aria-label="إرسال"><Send /></Button>
    </form>
  </article>;
}

export function ParentChat() {
  const [schools, setSchools] = useState<{ id: string; name: string }[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: s } = await supabase.auth.getSession(); const uid = s.session?.user.id ?? null;
      const { data } = await supabase.from("guardians").select("school_id,schools(name)").eq("user_id", uid ?? "").eq("status", "active");
      if (!alive) return;
      const list = ((data ?? []) as unknown as { school_id: string; schools: { name: string } | { name: string }[] | null }[]).map((g) => ({ id: g.school_id, name: (Array.isArray(g.schools) ? g.schools[0]?.name : g.schools?.name) ?? "المدرسة" }));
      setMe(uid); setSchools(list); setPick(list[0]?.id ?? null);
    })().catch(() => setSchools([]));
    return () => { alive = false; };
  }, []);
  return <>
    <div className="welcome"><div><p className="eyebrow">ولي الأمر</p><h1>المحادثة مع المدرسة</h1><p>اسأل المدرسة أو بلّغها بملاحظة، وتصلك الردود بإشعار.</p></div>
      {schools && schools.length > 1 && <select className="sub-driver" aria-label="المدرسة" value={pick ?? ""} onChange={(e) => setPick(e.target.value)}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}</div>
    {schools?.length === 0 && <article className="panel ops-panel"><p className="muted-label">تظهر المحادثة بعد قبول المدرسة تسجيل ابنك.</p></article>}
    {pick && me && <Thread key={pick} schoolId={pick} guardianUser={me} asSchool={false} title={schools?.find((s) => s.id === pick)?.name ?? "المدرسة"} />}
  </>;
}

type ThreadRow = { guardian_user: string; guardian_name: string; students: string | null; last_body: string; last_at: string; last_from_school: boolean; unread: number };
export function SchoolChat({ schoolId }: { schoolId: string }) {
  const [rows, setRows] = useState<ThreadRow[]>([]);
  const [open, setOpen] = useState<ThreadRow | null>(null);
  const load = useCallback(async () => { const { data } = await supabase.rpc("school_threads", { p_school: schoolId }); setRows((data ?? []) as ThreadRow[]); }, [schoolId]);
  useEffect(() => {
    let alive = true;
    const run = async () => { if (alive) await load().catch(() => {}); };
    void run(); const t = window.setInterval(() => void run(), 20000);
    return () => { alive = false; window.clearInterval(t); };
  }, [load]);
  return <>
    <div className="welcome"><div><p className="eyebrow">إدارة المدرسة</p><h1>محادثات أولياء الأمور</h1><p>رسائل أولياء الأمور وردود المدرسة في مكان واحد.</p></div></div>
    <div className="chat-layout">
      <article className="panel ops-panel chat-threads">
        {rows.length === 0 && <p className="muted-label">لا توجد محادثات بعد.</p>}
        {rows.map((r) => <button key={r.guardian_user} className={`thread-row ${open?.guardian_user === r.guardian_user ? "active" : ""}`} onClick={() => { setOpen(r); void load(); }}>
          <strong>{r.guardian_name}{Number(r.unread) > 0 && <span className="unread">{r.unread}</span>}</strong>
          <span>{r.students ?? ""}</span><small>{r.last_from_school ? "المدرسة: " : ""}{r.last_body}</small></button>)}
      </article>
      {open ? <Thread key={open.guardian_user} schoolId={schoolId} guardianUser={open.guardian_user} asSchool title={`${open.guardian_name}${open.students ? ` · ${open.students}` : ""}`} />
        : <article className="panel ops-panel"><p className="muted-label">اختر محادثة من القائمة.</p></article>}
    </div>
  </>;
}
