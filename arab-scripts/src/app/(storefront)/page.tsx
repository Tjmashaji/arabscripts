import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Zap, DownloadCloud, Code2 } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center w-full">
      {/* HERO SECTION */}
      <section className="relative w-full max-w-7xl mx-auto px-4 py-24 sm:py-32 flex flex-col items-center text-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background -z-10" />
        
        <Badge variant="outline" className="mb-6 px-4 py-1.5 border-primary/50 text-primary bg-primary/10 backdrop-blur-sm">
          🚀 إطلاق النسخة الأولى من المنصة
        </Badge>
        
        <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-6 max-w-4xl leading-tight">
          الوجهة الأولى والأفضل <br />
          <span className="text-gradient">لسكربتات الرول بلاي</span> الاحترافية
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed font-medium">
          ارفع مستوى سيرفرك مع مجموعة متميزة من السكربتات المبرمجة بعناية، متوافقة مع ESX و QBCore، مع نظام تراخيص متطور ودعم فني على مدار الساعة.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Link href="/products">
            <Button size="lg" className="w-full sm:w-auto text-lg h-14 px-8 font-bold shadow-[0_0_40px_-10px_rgba(var(--primary),0.5)]">
              تصفح المنتجات
            </Button>
          </Link>
          <Button size="lg" variant="outline" className="w-full sm:w-auto text-lg h-14 px-8 font-bold glass">
            أوامر وإدارة المنصة
          </Button>
        </div>
      </section>

      {/* FEATURES SECTION */}
      <section className="w-full max-w-7xl mx-auto px-4 py-20 border-t border-border/50">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">لماذا تختار <span className="text-primary">ArabScripts</span>؟</h2>
          <p className="text-muted-foreground">نحن نقدم لك الجودة والأمان في مكان واحد</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard 
            icon={<ShieldCheck className="h-10 w-10 text-primary" />}
            title="نظام تراخيص آمن"
            description="حماية كاملة لبرمجياتك مع نظام License Keys ذكي وAPI للتحكم المباشر."
          />
          <FeatureCard 
            icon={<Zap className="h-10 w-10 text-primary" />}
            title="أداء عالي"
            description="كود مُحسن ونظيف (Optimized) لضمان عدم استهلاك موارد السيرفر 0.00ms."
          />
          <FeatureCard 
            icon={<Code2 className="h-10 w-10 text-primary" />}
            title="أحدث التقنيات"
            description="تطوير مستمر باستخدام أحدث تقنيات React/JS لكفاءة واجهات الـ UI وسرعة الاستجابة."
          />
          <FeatureCard 
            icon={<DownloadCloud className="h-10 w-10 text-primary" />}
            title="تحميل فوري وحماية"
            description="استلم ملفاتك فور إتمام الدفع مع نظام ربط IP لحماية حقوقك واستخدامك."
          />
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <Card className="glass-card hover:border-primary/50 transition-colors duration-300">
      <CardContent className="p-6 flex flex-col items-start gap-4">
        <div className="p-3 rounded-2xl bg-primary/10">
          {icon}
        </div>
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
