import { ShieldAlert, BookOpen, Clock } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-20">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-black mb-4">السياسات وشروط الاستخدام</h1>
        <p className="text-muted-foreground text-lg">يرجى قراءة سياسات منصة ArabScripts بعناية قبل عملية الشراء.</p>
      </div>

      <div className="space-y-12">
        
        {/* Licensing */}
        <section className="glass-card p-8 rounded-2xl">
           <div className="flex items-center gap-3 mb-6">
              <ShieldAlert className="w-8 h-8 text-primary" />
              <h2 className="text-2xl font-bold">سياسة التراخيص (Licenses)</h2>
           </div>
           <ul className="space-y-4 text-muted-foreground leading-relaxed text-lg list-disc list-inside">
             <li>كل رخصة شراء صالحة ومربوطة بحساب <b>سيرفر واحد فقط</b> (IP أو Server ID واحد).</li>
             <li>يُمنع منعاً باتاً مشاركة مفتاح الترخيص مع أشخاص آخرين أو مجتمعات أخرى؛ فسيتم تعريضه للإيقاف الفوري.</li>
             <li>لدينا نظام تتبع API آلي يقوم بحظر التراخيص التي يتم استخدامها في أكثر من سيرفر بوقت واحد وتجميد حسابك كعميل.</li>
             <li>الملفات قد تكون مشفرة (Escrow) جزئياً لحماية الحقوق الفكرية، مع ترك ملفات الإعدادات Config.lua مفتوحة.</li>
           </ul>
        </section>

        {/* Refunds */}
        <section className="glass-card p-8 rounded-2xl">
           <div className="flex items-center gap-3 mb-6">
              <Clock className="w-8 h-8 text-primary" />
              <h2 className="text-2xl font-bold">سياسة الاسترجاع المالي (Refunds)</h2>
           </div>
           <ul className="space-y-4 text-muted-foreground leading-relaxed text-lg list-disc list-inside">
             <li>نظراً لأن المنتجات المُقدمة هي <b>منتجات رقمية (Digital Goods) قابلة للنسخ والتحميل الفوري</b>، لا يوجد لدينا نظام استرجاع مالي لمجرد تغيير الرأي.</li>
             <li>يتم الاسترجاع المالي <span className="text-destructive font-bold">فقط</span> في الحالات القهرية كأن لا يعمل السكربت كلياً حتى بعد تدخل فريق الدعم الفني لحل المشكلة لك.</li>
             <li>أي عملية استرداد (Chargeback) عبر البنك أو Paypal بدون تواصل مسبق ستؤدي للحظر الدائم من المنصة وإلغاء جميع رخصك النشطة.</li>
           </ul>
        </section>

        {/* General Terms */}
        <section className="glass-card p-8 rounded-2xl">
           <div className="flex items-center gap-3 mb-6">
              <BookOpen className="w-8 h-8 text-primary" />
              <h2 className="text-2xl font-bold">شروط المنصة العامة</h2>
           </div>
           <ul className="space-y-4 text-muted-foreground leading-relaxed text-lg list-disc list-inside">
             <li>أنت توافق على أن منصة ArabScripts ليست تابعة لشركة Rockstar Games أو Cfx.re بأي شكل من الأشكال.</li>
             <li>تلتزم باستخدام السكربتات بأسلوب أخلاقي لا يتعارض مع القوانين والأنظمة المعمول بها.</li>
             <li>يحق لإدارة المنصة تغيير وتحديث هذه الشروط في أي وقت مع إشعار العملاء عبر قنوات الاتصال الرسمية.</li>
           </ul>
        </section>
      </div>
    </div>
  );
}
