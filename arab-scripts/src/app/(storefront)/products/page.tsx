import { PrismaClient } from "@prisma/client";
import Link from "next/link";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const prisma = new PrismaClient();

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    where: { status: 'PUBLISHED' },
    include: {
      category: true,
      images: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-20 flex flex-col items-center">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold mb-4">تصفح المنتجات</h1>
        <p className="text-muted-foreground text-lg">أقوى السكربتات والباقات للرول بلاي، جميعها في مكان واحد.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
        {products.map((product) => {
          const primaryImage = product.images.find(img => img.isPrimary)?.url || product.images[0]?.url || 'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?w=800&q=80';
          
          return (
            <Card key={product.id} className="glass-card hover:border-primary/50 transition-all duration-300 overflow-hidden flex flex-col group">
              <div className="relative h-48 w-full overflow-hidden">
                <div className="absolute inset-0 bg-primary/10 mix-blend-overlay z-10"></div>
                <img src={primaryImage} alt={product.name} className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-500" />
                <Badge className="absolute top-4 right-4 z-20 backdrop-blur-md bg-black/50 text-white border-white/20">
                  {product.category.name}
                </Badge>
              </div>
              <CardContent className="p-6 flex-grow flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-bold mb-2 line-clamp-1">{product.name}</h3>
                  <p className="text-muted-foreground text-sm line-clamp-2 mb-4 leading-relaxed">
                    {product.shortDesc}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-auto">
                  {product.compareAtPrice && (
                    <span className="text-sm text-muted-foreground line-through">{product.compareAtPrice} ريال</span>
                  )}
                  <span className="text-2xl font-black text-primary">{product.price} <span className="text-sm font-normal">ريال</span></span>
                </div>
              </CardContent>
              <CardFooter className="p-6 pt-0 mt-auto">
                <Link href={`/products/${product.slug}`} className="w-full">
                  <Button className="w-full font-bold shadow-[0_0_20px_-5px_rgba(var(--primary),0.4)]">
                    عرض التفاصيل
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
