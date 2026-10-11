"use client";

import { useState } from "react";
import {
  BellRing, BusFront, ChartNoAxesCombined, ClipboardCheck, HeadsetIcon, LogIn, MapPinned, Menu, MessageCircleQuestion,
  RadioTower, Route, School, ShieldCheck, Siren, Smartphone, UserCheck, Users, X,
} from "lucide-react";

// الصفحة التعريفية العامة لمساري: لكل جمهور قسم، وأزرار الدخول وتسجيل المدرسة.

type Feature = { icon: typeof School; title: string; text: string };
type Audience = { id: string; badge: string; icon: typeof School; title: string; subtitle: string; features: Feature[] };

const AUDIENCES: Audience[] = [
  { id: "schools", badge: "للمدارس", icon: School, title: "نقل مدرسي منظّم من شاشة واحدة", subtitle: "أدِر الباصات والمسارات والطلاب ورحلات اليوم، وتابع كل شيء لحظة بلحظة.", features: [
    { icon: Route, title: "مسارات واضحة", text: "أنشئ المسارات ومحطاتها على الخريطة وأسند لكل طالب محطته." },
    { icon: ClipboardCheck, title: "اعتماد مركزي", text: "راجع طلبات الطلاب والسائقين واعتمدها، فتُربط الحسابات تلقائيًا." },
    { icon: RadioTower, title: "برج مراقبة مباشر", text: "كل الرحلات الجارية ومواقع الباصات والبلاغات في مكان واحد." },
    { icon: ChartNoAxesCombined, title: "سجل موثّق", text: "حضور وانصراف وأحداث كل رحلة محفوظة ومؤرخة." },
  ] },
  { id: "parents", badge: "لأولياء الأمور", icon: Users, title: "اطمئن على ابنك في كل رحلة", subtitle: "تابع الباص على الخريطة، وتصلك التنبيهات فور صعود ابنك ووصوله.", features: [
    { icon: MapPinned, title: "تتبع مباشر", text: "موقع الباص أثناء رحلة ابنك فقط، دون أي بيانات لغيره." },
    { icon: BellRing, title: "تنبيهات فورية", text: "اقتراب الباص، الصعود، الوصول للمدرسة والمنزل — حتى والتطبيق مغلق." },
    { icon: UserCheck, title: "تسجيل الغياب", text: "أبلغ بغياب ابنك قبل بدء الرحلة فلا ينتظره السائق." },
    { icon: Users, title: "كل أبنائك", text: "تنقّل بين أبنائك في المدارس والمسارات المختلفة بسهولة." },
  ] },
  { id: "drivers", badge: "للسائقين", icon: BusFront, title: "ركّز على الطريق والباقي علينا", subtitle: "رحلة اليوم وطلابها ومحطاتها جاهزة على جوالك.", features: [
    { icon: Route, title: "محطات بالترتيب", text: "المحطة التالية دائمًا أمامك، واعتمادها بضغطة عند الوصول." },
    { icon: ClipboardCheck, title: "حضور بضغطة", text: "سجّل الصعود والنزول وعدم الحضور دون أوراق." },
    { icon: HeadsetIcon, title: "اتصالات أقل", text: "أولياء الأمور يتابعون تلقائيًا فلا حاجة لمكالمات «أين أنت؟»." },
    { icon: Siren, title: "بلاغ طوارئ", text: "بلاغ فوري لبرج المراقبة مع موقعك عند أي طارئ." },
  ] },
  { id: "supervisors", badge: "للمشرفين", icon: ShieldCheck, title: "رقابة وأمان قبل كل شيء", subtitle: "الصلاحيات مفروضة من الخادم، وكل اعتماد محطة يتحقق من موقع GPS الفعلي.", features: [
    { icon: MapPinned, title: "تحقق جغرافي", text: "لا تُعتمد المحطة إلا داخل نطاقها الجغرافي وبدقة GPS مقبولة." },
    { icon: ShieldCheck, title: "خصوصية البيانات", text: "كل مستخدم يرى ما يخصه فقط: المدرسة مدرستها، وولي الأمر أبناءه." },
    { icon: Siren, title: "متابعة البلاغات", text: "استلام البلاغات ومعالجتها وإغلاقها بملاحظة موثّقة." },
    { icon: BusFront, title: "تأكيد خلو الباص", text: "لا تنتهي الرحلة قبل تأكيد السائق خلو الباص من الطلاب." },
  ] },
];

const FAQ = [
  { q: "كيف تسجّل المدرسة في مساري؟", a: "اضغط «سجّل مدرستك»، أنشئ حسابًا وأكّد بريدك، ثم أكمل ملف المدرسة وموقعها. بعد مراجعة الطلب واعتماده تصبح مدير المدرسة في النظام." },
  { q: "كيف ينضم ولي الأمر والسائق؟", a: "تضيفهم المدرسة ببريدهم، وعندما يسجّلون في مساري بنفس البريد يُربط حسابهم ويُفعَّل تلقائيًا." },
  { q: "هل يعمل على الجوال؟", a: "نعم، من متصفح الجوال مباشرة، ويمكن إضافته للشاشة الرئيسية ليعمل كتطبيق ويستقبل الإشعارات." },
  { q: "من يرى موقع الباص؟", a: "إدارة المدرسة، وولي الأمر أثناء رحلة ابنه فقط، والسائق نفسه." },
];

export function Landing({ onLogin, onRegisterSchool, onDemo }: { onLogin: () => void; onRegisterSchool: () => void; onDemo: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const links = [...AUDIENCES.map((a) => ({ href: `#${a.id}`, label: a.badge })), { href: "#pricing", label: "الأسعار" }, { href: "#faq", label: "الأسئلة الشائعة" }];
  return <div dir="rtl" className="landing">
    <header className="lp-nav">
      <a className="lp-brand" href="#top"><span className="brand-mark"><BusFront /></span><strong>مساري</strong></a>
      <nav className={menuOpen ? "open" : ""} aria-label="الأقسام">{links.map((l) => <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>{l.label}</a>)}</nav>
      <div className="lp-actions">
        <button className="lp-login" onClick={onLogin}><LogIn /> تسجيل الدخول</button>
        <button className="lp-cta" onClick={onRegisterSchool}><School /> سجّل مدرستك</button>
        <button className="lp-menu" aria-label="القائمة" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>{menuOpen ? <X /> : <Menu />}</button>
      </div>
    </header>

    <section id="top" className="lp-hero">
      <span className="lp-pill"><Smartphone /> منصة النقل المدرسي الذكي</span>
      <h1>كل رحلة مدرسية،<br />آمنة ومعروفة لحظة بلحظة</h1>
      <p>مساري يربط المدرسة والسائق وولي الأمر في نظام واحد: مسارات، حضور، تتبع مباشر، وتنبيهات فورية.</p>
      <div className="lp-hero-actions">
        <button className="lp-cta big" onClick={onRegisterSchool}><School /> سجّل مدرستك الآن</button>
        <button className="lp-ghost big" onClick={onLogin}><LogIn /> لدي حساب</button>
      </div>
      <button className="lp-demo" onClick={onDemo}>جرّب الواجهة ببيانات تجريبية</button>
    </section>

    {AUDIENCES.map((a) => <section key={a.id} id={a.id} className="lp-section">
      <span className="lp-pill"><a.icon /> {a.badge}</span>
      <h2>{a.title}</h2>
      <p className="lp-sub">{a.subtitle}</p>
      <div className="lp-cards">{a.features.map((f) => <article key={f.title} className="lp-card"><span className="lp-icon"><f.icon /></span><h3>{f.title}</h3><p>{f.text}</p></article>)}</div>
    </section>)}

    <section id="pricing" className="lp-section">
      <span className="lp-pill"><ChartNoAxesCombined /> الأسعار</span>
      <h2>باقات تناسب حجم مدرستك</h2>
      <p className="lp-sub">الاستخدام مجاني لأولياء الأمور والسائقين. باقة المدرسة حسب عدد الباصات والطلاب — تواصل معنا بعد التسجيل لعرض مناسب.</p>
      <button className="lp-cta" onClick={onRegisterSchool}><School /> ابدأ بتسجيل مدرستك</button>
    </section>

    <section id="faq" className="lp-section">
      <span className="lp-pill"><MessageCircleQuestion /> الأسئلة الشائعة</span>
      <h2>أسئلة يطرحها الجميع</h2>
      <div className="lp-faq">{FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}</div>
    </section>

    <footer className="lp-footer"><span className="brand-mark"><BusFront /></span><strong>مساري</strong><span>إدارة وتتبع النقل المدرسي</span></footer>
  </div>;
}
