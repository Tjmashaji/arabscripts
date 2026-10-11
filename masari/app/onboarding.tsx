"use client";

import { useState } from "react";
import { BusFront } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SchoolFinder } from "./school-directory";

// حساب مسجّل لكنه بلا دور معتمد بعد: ولي الأمر يبحث عن مدرسة ابنه ويطلب الخدمة،
// ومسؤول المدرسة يطلب تفعيلها (لا يُنشئ حساب مدرسة بنفسه)، ثم «تحقق الآن» بعد ربط الحساب.

export function PendingAccount({ email, requestedRole, suspended, onSignOut, onRecheck }: { email: string; requestedRole?: string; suspended: boolean; onSignOut: () => void; onRecheck: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const recheck = async () => { setBusy(true); try { await onRecheck(); } finally { setBusy(false); } };
  const schoolStaff = requestedRole === "school";

  return <main dir="rtl" className="auth-page">
    <section className="auth-hero"><div className="brand-mark large"><BusFront /></div><p className="eyebrow">مساري</p><h1>{suspended ? "الحساب موقوف" : "حسابك بانتظار التفعيل"}</h1><p>{email}</p></section>
    <section className="auth-shell pending-shell">
      {suspended ? <article className="panel ops-panel"><p>تم إيقاف هذا الحساب. تواصل مع إدارة مساري لمعرفة السبب.</p></article> : <>
        <SchoolFinder email={email} schoolStaff={schoolStaff} />
        <article className="panel ops-panel">
          <div className="panel-head"><div><p className="eyebrow">بعد الربط</p><h2>{schoolStaff ? "بعد تفعيل مدرستك" : "مدرسة ابنك على مساري؟"}</h2></div></div>
          <p className="muted-label">{schoolStaff
            ? <>عند تفعيل المدرسة تُربط صلاحية مديرها بالبريد الذي اعتمدته إدارة مساري. إن كان بريدك <strong dir="ltr">{email}</strong> فاضغط «تحقق الآن».</>
            : <>ابحث عن مدرسة ابنك أعلاه واضغط «سجّل ابنك في النقل». عند قبول المدرسة يتفعل حسابك، فاضغط «تحقق الآن». وإن أضافتك المدرسة ببريدك <strong dir="ltr">{email}</strong> فالأمر نفسه.</>}</p>
          <Button variant="outline" className="wide-action" disabled={busy} onClick={() => void recheck()}>تحقق الآن</Button>
        </article>
      </>}
      <button className="text-link" onClick={onSignOut}>تسجيل الخروج</button>
    </section>
  </main>;
}
