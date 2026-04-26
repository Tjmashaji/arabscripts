import { PrismaClient } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { CheckoutClient } from "./CheckoutClient";

const prisma = new PrismaClient();

export default async function CheckoutPage(props: { params: Promise<{ productSlug: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    redirect(`/login?callbackUrl=/checkout/${params.productSlug}`);
  }

  const product = await prisma.product.findUnique({
    where: { slug: params.productSlug },
    include: { images: true }
  });

  if (!product) {
    notFound();
  }

  const primaryImage = product.images.find(img => img.isPrimary)?.url || product.images[0]?.url || 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?w=800&q=80';

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-20">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-black mb-4">إتمام الطلب</h1>
        <p className="text-muted-foreground flex items-center justify-center gap-2">
           <ShieldCheck className="w-5 h-5 text-primary" /> معاملاتك مشفرة ومؤمنة بالكامل
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Order Details (Left / Main side in RTL) */}
        <div className="lg:col-span-2 space-y-6">
           <div className="glass-card p-6 rounded-2xl flex flex-col md:flex-row gap-6 items-center md:items-start transition-colors">
              <img src={primaryImage} alt={product.name} className="w-32 h-32 rounded-xl object-cover shadow-lg" />
              <div className="flex-grow text-center md:text-right">
                 <h2 className="text-2xl font-bold mb-2">{product.name}</h2>
                 <p className="text-muted-foreground mb-4">{product.shortDesc}</p>
                 <div className="flex gap-4 items-center justify-center md:justify-start">
                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-bold">
                      {product.type}
                    </span>
                    <span className="bg-background text-muted-foreground px-3 py-1 rounded-full text-sm border border-border">
                      توافق: {product.compatibility || 'عام'}
                    </span>
                 </div>
              </div>
           </div>

           <div className="glass-card p-6 rounded-2xl">
              <h3 className="text-xl font-bold mb-4">ماذا ستحصل بعد الشراء المباشر؟</h3>
              <ul className="space-y-4">
                 <li className="flex gap-3 items-center text-muted-foreground">
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <span>رخصة استخدام فريدة (License Key) صالحة لـ {product.compatibility || 'جميع الأنظمة'}.</span>
                 </li>
                 <li className="flex gap-3 items-center text-muted-foreground">
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <span>إمكانية تحميل الملفات بشكل فوري ومستمر بتحديثات دورية مجانية.</span>
                 </li>
                 <li className="flex gap-3 items-center text-muted-foreground">
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <span>دعم فني مخصص في ديسكورد للرد على استفساراتك.</span>
                 </li>
              </ul>
           </div>
        </div>

        {/* Summary (Right / Sidebar in RTL) */}
        <div className="lg:col-span-1">
           <div className="glass-card border-primary/20 shadow-[0_0_40px_-15px_rgba(var(--primary),0.3)] p-6 rounded-2xl sticky top-24">
              <h3 className="text-xl font-bold mb-6 border-b border-border/50 pb-4">ملخص الطلب</h3>
              
              <div className="flex justify-between items-center mb-4 text-muted-foreground">
                 <span>المنتج:</span>
                 <span>{product.name}</span>
              </div>
              <div className="flex justify-between items-center mb-4 text-muted-foreground">
                 <span>السعر الأساسي:</span>
                 <span className="font-mono">{product.price.toFixed(2)} ر.س</span>
              </div>
              
              <div className="border-t border-border/50 mt-6 pt-6 flex justify-between items-end mb-8">
                 <span className="text-lg font-bold">الإجمالي:</span>
                 <div className="text-left">
                   <span className="text-3xl font-black text-primary">{product.price.toFixed(2)}</span>
                   <span className="text-sm text-primary ml-1 font-bold">ر.س</span>
                 </div>
              </div>

              <CheckoutClient productId={product.id} price={product.price} />
              
              <p className="text-center text-xs text-muted-foreground mt-4 leading-relaxed">
                ستتمكن من الدفع يدوياً عبر التحويل البنكي أو STC Pay. سيتم تزويدك بالبيانات بعد إتمام الطلب لتأكيد الدفع.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}
