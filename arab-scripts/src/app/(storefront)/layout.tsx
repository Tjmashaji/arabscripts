import { Header } from "@/components/shared/Header";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      {/* Main content expands to fill available space */}
      <main className="flex-1 flex flex-col w-full">
        {children}
      </main>

      {/* Real Footer Setup */}
      <footer className="w-full border-t border-border mt-auto py-12 bg-background/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
          <div>
            <h3 className="text-xl font-bold mb-4 text-gradient">ArabScripts</h3>
            <p className="text-muted-foreground leading-relaxed max-w-sm">
              المنصة العربية الرائدة لتوفير أحدث السكربتات وبرمجيات الفايف إم عالية الجودة والمحمية، لضمان استقرار سيرفرك وتقديم تجربة لعب استثنائية.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-foreground">روابط سريعة</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li><a href="/products" className="hover:text-primary transition-colors">تصفح المتجر</a></li>
              <li><a href="/dashboard" className="hover:text-primary transition-colors">مشترياتي</a></li>
              <li><a href="/dashboard" className="hover:text-primary transition-colors">إدارة التراخيص الخاصة بي</a></li>
              <li><a href="/support" className="hover:text-primary transition-colors">الدعم الفني وفتح تذكرة</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-foreground">السياسات</h4>
            <ul className="space-y-2 text-muted-foreground">
              <li><a href="/terms" className="hover:text-primary transition-colors">شروط الخدمة</a></li>
              <li><a href="/privacy" className="hover:text-primary transition-colors">سياسة الخصوصية</a></li>
              <li><a href="/refund" className="hover:text-primary transition-colors">سياسة الاسترجاع</a></li>
            </ul>
          </div>
        </div>
        <div className="text-center mt-12 pt-8 border-t border-border/50 text-muted-foreground">
          <p>جميع الحقوق محفوظة &copy; {new Date().getFullYear()} ArabScripts</p>
        </div>
      </footer>
    </>
  );
}
