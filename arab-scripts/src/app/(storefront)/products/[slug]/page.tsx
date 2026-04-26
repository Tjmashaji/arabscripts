import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Server, Shield } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const prisma = new PrismaClient();

export default async function ProductDetailsPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: {
      category: true,
      images: true,
    }
  });

  if (!product) {
    notFound();
  }

  const primaryImage = product.images.find(img => img.isPrimary)?.url || product.images[0]?.url || 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?w=800&q=80';
  
  const featuresList = product.features ? product.features.split('\n') : [];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-20">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        
        {/* Right side: Product Cover */}
        <div className="flex flex-col gap-4">
          <div className="relative rounded-2xl overflow-hidden glass-card border-none shadow-2xl h-[400px]">
            <img src={primaryImage} alt={product.name} className="object-cover w-full h-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="glass p-4 rounded-xl flex items-center gap-3">
               <Shield className="text-primary w-8 h-8" />
               <div>
                 <p className="text-sm text-muted-foreground">التوافقية</p>
                 <p className="font-bold">{product.compatibility || 'جميع المنصات'}</p>
               </div>
            </div>
            <div className="glass p-4 rounded-xl flex items-center gap-3">
               <Server className="text-primary w-8 h-8" />
               <div>
                 <p className="text-sm text-muted-foreground">نوع المنتج</p>
                 <p className="font-bold">{product.type}</p>
               </div>
            </div>
          </div>
        </div>

        {/* Left side: Info & Checkout */}
        <div className="flex flex-col">
          <Badge variant="outline" className="w-fit mb-4 text-primary border-primary bg-primary/10">
            {product.category.name}
          </Badge>
          
          <h1 className="text-4xl md:text-5xl font-black mb-4 leading-tight">{product.name}</h1>
          
          <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
            {product.shortDesc}
          </p>

          <div className="bg-card/50 border border-border rounded-2xl p-6 mb-8">
            <div className="flex items-end gap-3 mb-6">
              <span className="text-5xl font-black text-primary">{product.price}</span>
              <span className="text-xl text-muted-foreground mb-1">ريال سعودي</span>
              {product.compareAtPrice && (
                <span className="text-lg text-muted-foreground line-through mr-4 mb-2">{product.compareAtPrice} ريال</span>
              )}
            </div>
            
            {/* Purchase action */}
            <Link href={`/checkout/${product.slug}`} className="w-full">
              <Button size="lg" className="w-full h-14 text-lg font-bold shadow-[0_0_30px_-5px_rgba(var(--primary),0.5)] flex gap-2">
                 متابعة الشراء
              </Button>
            </Link>
            <p className="text-center text-xs text-muted-foreground mt-4">سيتم تحويلك لصفحة إتمام الطلب الآمنة</p>
          </div>

          <div className="space-y-6">
            <h3 className="text-2xl font-bold">وصف المنتج</h3>
            <div className="prose prose-invert max-w-none text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {product.longDesc}
            </div>

            {featuresList.length > 0 && (
              <>
                <h3 className="text-2xl font-bold mt-8">المميزات الرئيسية</h3>
                <ul className="space-y-3">
                  {featuresList.map((feature, idx) => (
                    <li key={idx} className="flex gap-3 items-center">
                      <CheckCircle2 className="text-primary w-5 h-5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
