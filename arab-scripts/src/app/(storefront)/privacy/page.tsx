export default function PrivacyPage() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-20 min-h-[60vh]">
      <h1 className="text-4xl font-bold mb-8 text-primary">سياسة الخصوصية</h1>
      <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed">
        <p>في ArabScripts، نلتزم بحماية خصوصية عملائنا. تشرح هذه السياسة كيفية جمع واستخدام بياناتك.</p>
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">1. جمع البيانات</h2>
        <p>نقوم بجمع البيانات الأساسية الضرورية لإتمام عمليات الشراء (مثل البريد الإلكتروني والاسم) وبيانات التحويل لغرض المراجعة فقط.</p>
        <h2 className="text-2xl font-bold text-foreground mt-8 mb-4">2. حماية البيانات</h2>
        <p>جميع البيانات والمرفقات (إيصالات التحويل) يتم تخزينها في خوادم مشفرة وآمنة ولا تُشارك أبداً مع أي أطراف خارجية.</p>
      </div>
    </div>
  );
}
