import { PrismaClient } from "@prisma/client";
import Link from "next/link";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const prisma = new PrismaClient();

export default async function ProductsPage(props: { searchParams: Promise<{ category?: string }> }) {
  const searchParams = await props.searchParams;
  const categoryFilter = searchParams.category;

  const categories = await prisma.category.findMany();

  const products = await prisma.product.findMany({
    where: { 
      status: 'PUBLISHED',
      ...(categoryFilter ? { categoryId: categoryFilter } : {})
    },
    include: {
      category: true,
      images: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-20 flex flex-col items-center">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tight">تصفح <span className="text-primary">المنتجات</span></h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">أقوى السكربتات والباقات للرول بلاي، جميعها في مكان واحد وبأعلى معايير البرمجة.</p>
      </div>

      {/* Categories Filter */}
      <div className="flex flex-wrap justify-center gap-3 mb-16">
         <Link href="/products">
            <Badge variant={!categoryFilter ? 'default' : 'outline'} className="text-sm px-4 py-2 cursor-pointer hover:scale-105 transition-transform text-md">
               الكل
            </Badge>
         </Link>
         {categories.map(c => (
            <Link key={c.id} href={`/products?category=${c.id}`}>
               <Badge variant={categoryFilter === c.id ? 'default' : 'outline'} className="text-sm px-4 py-2 cursor-pointer hover:scale-105 transition-transform text-md">
                  {c.name}
               </Badge>
            </Link>
         ))}
      </div>

      {products.length === 0 ? (
        <div className="text-center py-20 border border-border/50 rounded-2xl w-full bg-card/20">
           <h3 className="text-2xl font-bold mb-2">لا توجد منتجات</h3>
           <p className="text-muted-foreground">لم يتم إضافة منتجات في هذا التصنيف بعد.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
          {products.map((product) => {
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
                      <Button variant="secondary" className="w-full font-bold group-hover:bg-primary group-hover:text-primary-foreground transition-colors shadow-sm">
                        التفاصيل والشراء
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
