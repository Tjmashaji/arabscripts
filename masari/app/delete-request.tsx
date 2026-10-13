"use client";

import { BusFront, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

// صفحة عامة لطلب حذف الحساب من الويب دون تثبيت التطبيق (شرط Google Play): تعمل بدون تسجيل دخول،
// وتشرح الخطوات وما يُحذف وما يبقى ومدته. الحذف نفسه يتم بعد تسجيل الدخول من «حسابي» ← «حذف الحساب».

const STEPS = [
  "سجّل الدخول إلى مساري من هذا الموقع بالبريد وكلمة المرور نفسها التي تستخدمها في التطبيق.",
  "افتح «حسابي» من القائمة، ثم اضغط «حذف الحساب».",
  "اكتب بريدك للتأكيد، فيُحذف حسابك فورًا ونهائيًا.",
];

const DELETED = [
  "حسابك وبيانات الدخول.",
  "الاسم ورقم الجوال.",
  "الإشعارات ورموز إشعارات الجوال.",
  "المحادثات وروابط مشاركة الرحلة.",
  "صلاحياتك وربطك بالمدرسة أو بأبنائك.",
];

const KEPT = [
  "سجلات الرحلات والحضور تبقى لدى المدرسة دون ربطها باسمك، طوال العام الدراسي وسنة بعده، ثم تُحذف أو تُجهَّل.",
  "مواقع الباص تُحذف تلقائيًا بعد 90 يومًا من الرحلة.",
  "بيانات الطالب نفسه تملكها المدرسة، ويُطلب حذفها من إدارة المدرسة.",
];

export function DeleteAccountRequest({ onBack, onLogin }: { onBack: () => void; onLogin: () => void }) {
  return <main dir="rtl" className="privacy-page">
    <header className="lp-nav"><a className="lp-brand" href="#top" onClick={onBack}><span className="brand-mark"><BusFront /></span><strong>مساري</strong></a><button className="lp-login" onClick={onBack}>رجوع</button></header>
    <article className="privacy-body">
      <p className="eyebrow">مساري — منصة النقل المدرسي</p>
      <h1>حذف حسابك في مساري</h1>
      <p className="lead">تستطيع حذف حسابك وبياناتك الشخصية في أي وقت، من التطبيق أو من هذا الموقع، دون الحاجة لتثبيت التطبيق.</p>
      <section><h2>الخطوات</h2><ol>{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        <Button type="button" className="wide-action delete-request-login" onClick={onLogin}><LogIn /> سجّل الدخول لحذف حسابك</Button></section>
      <section><h2>ما يُحذف</h2><ul>{DELETED.map((s) => <li key={s}>{s}</li>)}</ul></section>
      <section><h2>ما يبقى ولماذا</h2><ul>{KEPT.map((s) => <li key={s}>{s}</li>)}</ul></section>
      <section><h2>لا تستطيع الدخول؟</h2><p>استعد كلمة المرور من صفحة الدخول، أو اطلب من إدارة مدرسة ابنك حذف ربطك بالمدرسة وبياناتك، فهي تتواصل مع مساري لإتمام الحذف خلال 30 يومًا.</p></section>
      <p><a className="text-link" href="#privacy">سياسة الخصوصية</a></p>
    </article>
  </main>;
}
