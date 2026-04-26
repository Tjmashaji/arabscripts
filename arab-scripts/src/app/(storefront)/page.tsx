import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Zap, DownloadCloud, Code2, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function Home() {
  // الادمن يتحكم بالمنتجات المميزة المعروضة في الصفحة الرئيسية
  const featuredProducts = await prisma.product.findMany({
    where: { status: 'PUBLISHED', isFeatured: true },
    include: { category: true, images: true },
    take: 3,
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="flex flex-col items-center w-full">
      {/* HERO SECTION */}
      <section className="relative w-full max-w-7xl mx-auto px-4 py-20 sm:py-32 flex flex-col items-center text-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-background to-background -z-10" />
        
        <Badge variant="outline" className="mb-8 px-4 py-2 border-primary/50 text-primary bg-primary/10 backdrop-blur-sm shadow-[0_0_20px_-5px_rgba(var(--primary),0.5)] transition-all hover:scale-105 cursor-default">
          🚀 الوجهة المفضلة لأصحاب سيرفرات الرول بلاي
        </Badge>
        
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tight mb-8 max-w-5xl leading-[1.2] md:leading-[1.1]">
          سكربتات <span className="text-gradient">حصرية واحترافية</span> <br className="hidden sm:block" />
          جاهزة لرفع مستوى سيرفرك
        </h1>
        
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed font-medium px-2 md:px-0">
          أضف لمسة الإبداع لسيرفرك مع أقوى السكربتات المبرمجة بذكاء. توافق تام مع أحدث إصدارات ESX و QBCore وتجربة مستخدم مبهرة.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto px-4 sm:px-0">
          <Link href="/products" className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto text-lg h-14 md:h-16 px-8 md:px-12 font-bold shadow-[0_0_40px_-5px_rgba(var(--primary),0.6)] hover:scale-105 transition-transform rounded-2xl">
              <ShoppingCart className="w-5 h-5 ml-2" /> تصفح المتجر بالكامل
            </Button>
          </Link>
        </div>
      </section>

      {/* FEATURED PRODUCTS (Admin Controlled) */}
      {featuredProducts.length > 0 && (
        <section className="w-full max-w-7xl mx-auto px-4 py-16">
          <div className="flex justify-between items-end mb-10 border-b border-border/50 pb-4">
            <div>
              <h2 className="text-3xl font-bold mb-2">منتجات <span className="text-primary">مميزة</span></h2>
              <p className="text-muted-foreground">أفضل السكربتات المختارة لك</p>
            </div>
            <Link href="/products" className="hidden md:flex text-primary hover:underline font-bold text-sm">
              عرض الكل &larr;
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
            {featuredProducts.map((product) => {
              const primaryImage = product.images.find(img => img.isPrimary)?.url || product.images[0]?.url || 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?w=800&q=80';
              
              return (
                <Card key={product.id} className="glass-card hover:border-primary/50 transition-all duration-300 overflow-hidden flex flex-col group shadow-lg">
                  <div className="relative h-56 w-full overflow-hidden">
                    <div className="absolute inset-0 bg-primary/20 mix-blend-overlay z-10 group-hover:opacity-0 transition-opacity"></div>
                    <img src={primaryImage} alt={product.name} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute top-4 right-4 z-20 flex gap-2">
                       <Badge className="backdrop-blur-md bg-black/60 text-white border-white/20">
                         {product.category.name}
                       </Badge>
                       <Badge className="backdrop-blur-md bg-primary/80 text-white border-white/20">
                         {product.type}
                       </Badge>
                    </div>
                  </div>
                  <CardContent className="p-6 flex-grow flex flex-col justify-between relative">
                    <div className="absolute top-0 right-8 -translate-y-1/2 bg-background border border-border px-4 py-1 rounded-full shadow-lg font-black text-primary text-lg flex items-center gap-1">
                      {product.price} <span className="text-xs font-normal">ر.س</span>
                    </div>

                    <div className="mt-4">
                      <h3 className="text-xl font-bold mb-2 line-clamp-1">{product.name}</h3>
                      <p className="text-muted-foreground text-sm line-clamp-2 mb-4 leading-relaxed">
                        {product.shortDesc}
                      </p>
                    </div>
                    <div className="mt-auto pt-4 border-t border-border/30">
                      <Link href={`/products/${product.slug}`} className="w-full block">
                        <Button variant="secondary" className="w-full font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          التفاصيل والشراء
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* FEATURES SECTION */}
      <section className="w-full max-w-7xl mx-auto px-4 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <FeatureCard 
            icon={<ShieldCheck className="h-10 w-10 text-primary" />}
            title="حماية وضمان حقوق"
            description="نظام تراخيص مبرمج يمنع تسريب السكربتات ويحفظ حقوقك وحقوقنا بامتياز."
          />
          <FeatureCard 
            icon={<Zap className="h-10 w-10 text-primary" />}
            title="أداء وكفاءة (0.0ms)"
            description="أكواد نظيفة مبرمجة بأعلى المعايير ولا تسبب أي مساحات مهدرة في الرام."
          />
          <FeatureCard 
            icon={<Code2 className="h-10 w-10 text-primary" />}
            title="تصاميم عصرية (UI)"
            description="نعتمد على React و Tailwind لبناء قوائم وشاشات تسحر لاعبينك بالجمال."
          />
          <FeatureCard 
            icon={<DownloadCloud className="h-10 w-10 text-primary" />}
            title="تحميل فوري"
            description="لا داعي للانتظار! السكربت سيكون في لوحة تحكمك فور الدفع تلقائياً."
          />
        </div>
      </section>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <Card className="glass-card transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_10px_40px_-15px_rgba(var(--primary),0.5)] group cursor-default">
      <CardContent className="p-8 flex flex-col items-start gap-4">
        <div className="p-4 rounded-2xl bg-primary/10 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-500 shadow-inner">
          {icon}
        </div>
        <h3 className="text-xl font-bold group-hover:text-primary transition-colors">{title}</h3>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}
