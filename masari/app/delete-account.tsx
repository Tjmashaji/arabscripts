"use client";

import { useState } from "react";
import { Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// حذف الحساب كاملًا من داخل التطبيق (شرط متجر Apple): يكتب المستخدم بريده للتأكيد ثم يُحذف حسابه وبياناته الشخصية نهائيًا.

const errText: Record<string, string> = {
  CONFIRM_MISMATCH: "البريد المكتوب لا يطابق بريد حسابك.",
  LAST_ADMIN: "أنت آخر مدير للنظام؛ أضف مديرًا آخر قبل حذف حسابك.",
};

export function DeleteAccount({ email, onDeleted, compact = false }: { email: string; onDeleted: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const ok = confirm.trim().toLowerCase() === email.trim().toLowerCase() && email !== "";
  const run = async () => {
    if (!ok || busy) return;
    setBusy(true); setMsg("");
    const { error } = await supabase.rpc("delete_my_account", { p_confirm_email: confirm.trim() });
    setBusy(false);
    if (error) { setMsg(Object.entries(errText).find(([k]) => error.message.includes(k))?.[1] ?? "تعذر حذف الحساب. حاول لاحقًا أو تواصل مع إدارة مساري."); return; }
    await supabase.auth.signOut().catch(() => {});
    onDeleted();
  };
  if (!open) return <button type="button" className={compact ? "text-link danger-link" : "danger-outline"} onClick={() => setOpen(true)}><Trash2 /> حذف الحساب</button>;
  return <div className="delete-account" role="group" aria-label="حذف الحساب">
    <strong>حذف الحساب نهائيًا</strong>
    <p>سيُحذف حسابك وبياناتك الشخصية (الاسم والجوال والإشعارات والمحادثات وصلاحياتك) ولا يمكن التراجع. سجلات الرحلات تبقى عند المدرسة دون اسمك.</p>
    <label htmlFor="del-email">اكتب بريدك <bdi dir="ltr">{email}</bdi> للتأكيد</label>
    <input id="del-email" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
    {msg && <p className="ops-error">{msg}</p>}
    <div className="delete-actions">
      <Button variant="destructive" disabled={!ok || busy} onClick={() => void run()}><Trash2 /> {busy ? "جارٍ الحذف…" : "احذف حسابي"}</Button>
      <button type="button" className="text-link" onClick={() => { setOpen(false); setConfirm(""); setMsg(""); }}>إلغاء</button>
    </div>
  </div>;
}

export function AccountPage({ name, email, roleLabel, onDeleted, children }: { name: string; email: string; roleLabel: string; onDeleted: () => void; children?: React.ReactNode }) {
  return <>
    <div className="welcome"><div><p className="eyebrow">حسابي</p><h1>{name || "حسابي"}</h1><p>{roleLabel}</p></div></div>
    <article className="panel">
      <div className="panel-head"><div><p className="eyebrow">بيانات الدخول</p><h2><bdi dir="ltr">{email}</bdi></h2></div><UserRound className="title-icon" /></div>
      {children}
    </article>
    <article className="panel">
      <div className="panel-head"><div><p className="eyebrow">الخصوصية</p><h2>حذف الحساب</h2></div><Trash2 className="title-icon" /></div>
      <DeleteAccount email={email} onDeleted={onDeleted} />
    </article>
  </>;
}
