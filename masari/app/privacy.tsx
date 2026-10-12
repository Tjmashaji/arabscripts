"use client";

import { useState } from "react";
import { BusFront, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

// سياسة الخصوصية (نظام حماية البيانات الشخصية في المملكة). عند تعديلها جوهريًا تُرفع النسخة،
// فيُطلب من كل مستخدم الموافقة على النسخة الجديدة عند دخوله التالي.
export const PRIVACY_VERSION = "2026-10";
export const PRIVACY_URL = "/#privacy";

const SECTIONS: { title: string; body: string[] }[] = [
  { title: "من نحن", body: ["«مساري» منصة لإدارة وتتبع النقل المدرسي، تربط المدرسة والسائق وولي الأمر والجهات التعليمية المشرفة. نعالج البيانات بالنيابة عن المدرسة لغرض تشغيل النقل المدرسي فقط."] },
  { title: "البيانات التي نجمعها", body: [
    "بيانات الحساب: الاسم، البريد الإلكتروني، الجوال.",
    "بيانات الطالب: الاسم، الصف، المدرسة، رقم الهوية (اختياري)، عنوان المنزل وموقعه على الخريطة، مساره ومحطته.",
    "بيانات السائق: الاسم، الجوال، البريد، رقم الرخصة وتاريخ انتهائها.",
    "موقع الباص أثناء الرحلة فقط (من جوال السائق)، وسجل صعود الطلاب ونزولهم وغيابهم.",
    "رموز إشعارات الجوال، والبلاغات والملاحظات التي يرسلها المستخدم.",
  ] },
  { title: "لماذا نجمعها", body: ["تشغيل الرحلات وتحديد المحطات، وإبلاغ ولي الأمر بصعود ابنه ووصوله، ومراقبة سلامة الرحلات، والتواصل عند الطوارئ، والفوترة بين المدرسة ومساري. لا نبيع البيانات ولا نستخدمها للإعلانات."] },
  { title: "الأساس النظامي", body: ["موافقة ولي الأمر عند تسجيل ابنه، وتنفيذ اتفاقية تقديم الخدمة مع المدرسة. لولي الأمر سحب موافقته في أي وقت بالتواصل مع المدرسة أو معنا، مع العلم أن ذلك يوقف خدمة النقل لابنه."] },
  { title: "من يرى البيانات", body: [
    "المدرسة: بيانات طلابها وسائقيها ورحلاتها.",
    "ولي الأمر: بيانات أبنائه، وموقع الباص أثناء رحلة ابنه فقط.",
    "السائق: أسماء طلاب رحلته ومحطاتهم.",
    "إدارة التعليم في المنطقة: متابعة الرحلات والمدارس في منطقتها لأغراض الإشراف والسلامة.",
    "مزودو الخدمة التقنية: الاستضافة وقاعدة البيانات لدى Supabase (خوادم في مومباي، الهند)، ونشر الموقع لدى Vercel، بموجب اتفاقيات تحمي البيانات. أي نقل للبيانات خارج المملكة يتم وفق ضوابط نظام حماية البيانات الشخصية ولائحته.",
  ] },
  { title: "مدة الاحتفاظ", body: [
    "مواقع الباص: تُحذف تلقائيًا بعد 90 يومًا من الرحلة.",
    "الإشعارات المقروءة: تُحذف بعد 180 يومًا.",
    "سجلات الحضور والرحلات: طوال العام الدراسي وسنة بعده، ثم تُحذف أو تُجهَّل.",
    "الحسابات: حتى يطلب صاحبها حذفها أو تنتهي علاقته بالمدرسة.",
  ] },
  { title: "حقوقك", body: ["لك الحق في معرفة بياناتك، والحصول على نسخة منها، وتصحيحها، وطلب حذفها أو تقييد معالجتها، وسحب موافقتك، وتقديم شكوى إلى الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا). نرد على الطلبات خلال 30 يومًا."] },
  { title: "الحماية", body: ["الاتصال مشفر، وصلاحيات الوصول مفروضة من قاعدة البيانات نفسها لكل دور، وكل عملية حساسة تُسجَّل في سجل تدقيق. تُبلَّغ الجهات المختصة والمتأثرون عند أي حادثة تسرب وفق النظام."] },
  { title: "الأطفال", body: ["بيانات الطلاب يقدمها ولي الأمر أو المدرسة، ولا يملك الطالب حسابًا. لا نجمع من الطالب أي بيانات مباشرة."] },
  { title: "التواصل", body: ["للاستفسار أو طلب أي حق من حقوقك: تواصل مع إدارة مدرسة ابنك، أو مع مساري عبر مدير النظام في التطبيق."] },
];

export function PrivacyPolicy({ onBack }: { onBack?: () => void }) {
  return <main dir="rtl" className="privacy-page">
    <header className="lp-nav"><a className="lp-brand" href="#top" onClick={onBack}><span className="brand-mark"><BusFront /></span><strong>مساري</strong></a>{onBack && <button className="lp-login" onClick={onBack}>رجوع</button>}</header>
    <article className="privacy-body">
      <p className="eyebrow">النسخة {PRIVACY_VERSION}</p>
      <h1>سياسة الخصوصية</h1>
      <p className="lead">نحمي بيانات أبنائكم كما نحمي بيانات أبنائنا. هذه السياسة توضح ما نجمعه ولماذا ومن يراه ومتى نحذفه.</p>
      {SECTIONS.map((s) => <section key={s.title}><h2>{s.title}</h2>{s.body.length === 1 ? <p>{s.body[0]}</p> : <ul>{s.body.map((b) => <li key={b}>{b}</li>)}</ul>}</section>)}
    </article>
  </main>;
}

// للحسابات التي لم توافق على النسخة الحالية
export function ConsentGate({ onAccepted, onSignOut }: { onAccepted: () => void; onSignOut: () => void }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const accept = async () => {
    setBusy(true); setErr("");
    const { error } = await supabase.rpc("accept_privacy", { p_version: PRIVACY_VERSION });
    setBusy(false);
    if (error) { setErr("تعذر حفظ موافقتك. حاول مرة أخرى."); return; }
    onAccepted();
  };
  return <main dir="rtl" className="auth-page">
    <section className="auth-hero"><div className="brand-mark large"><ShieldCheck /></div><p className="eyebrow">مساري</p><h1>سياسة الخصوصية</h1><p>حدّثنا سياسة الخصوصية. اطلع عليها ووافق للمتابعة.</p></section>
    <section className="auth-shell"><div className="auth-form-card">
      <p>توضح السياسة البيانات التي نجمعها عنك وعن أبنائك، ولماذا، ومن يراها، ومتى تُحذف، وحقوقك.</p>
      <a className="text-link" href={PRIVACY_URL} target="_blank" rel="noreferrer">قراءة سياسة الخصوصية</a>
      <label className="consent-check" htmlFor="gate-consent"><input id="gate-consent" type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> قرأت سياسة الخصوصية وأوافق عليها</label>
      {err && <p className="auth-message">{err}</p>}
      <Button className="wide-action" disabled={!checked || busy} onClick={() => void accept()}>{busy ? "جارٍ الحفظ…" : "موافقة ومتابعة"}</Button>
      <button className="text-link" onClick={onSignOut}>تسجيل الخروج</button>
    </div></section>
  </main>;
}
