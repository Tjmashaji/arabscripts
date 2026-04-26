export default function RefundPage() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-20 min-h-[60vh]">
      <h1 className="text-4xl font-bold mb-8 text-primary">سياسة الاسترجاع</h1>
      <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed">
        <p>نظراً لطبيعة المنتجات الرقمية (السكربتات والملفات المفتوحة/المشفرة)، فإن جميع المبيعات نهائية.</p>
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">متى يمكن استرجاع المبلغ؟</h2>
        <ul className="list-disc leading-loose pl-6 space-y-2">
           <li>في حال قمت بالدفع اليدوي ولم نوافق على الطلب لسبب معين من جهتنا.</li>
           <li>في حال كان السكربت لا يعمل نهائياً وتعذر على الدعم الفني الخاص بنا إيجاد حل جذري خلال 7 أيام من تاريخ الشراء.</li>
        </ul>
      </div>
    </div>
  );
}
