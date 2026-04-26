import { PrismaClient } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus, Trash2, Edit } from "lucide-react";

const prisma = new PrismaClient();

export default async function AdminProductsPage() {
  const products = await prisma.product.findMany({
    include: { category: true },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-20">
      <div className="flex justify-between items-center mb-10">
         <h1 className="text-4xl font-bold">إدارة المنتجات</h1>
         <Link href="/admin/products/new">
           <Button className="gap-2 text-lg h-12 px-6">
              <Plus className="w-5 h-5" /> إضافة منتج جديد
           </Button>
         </Link>
      </div>

      <div className="bg-card/40 border border-border/50 rounded-2xl overflow-hidden shadow-lg">
        <table className="w-full text-sm text-right">
          <thead className="bg-primary/20 text-primary">
            <tr>
              <th className="p-4">المنتج</th>
              <th className="p-4">التصنيف</th>
              <th className="p-4">السعر</th>
              <th className="p-4">الحالة</th>
              <th className="p-4">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {products.length === 0 && (
               <tr>
                 <td colSpan={5} className="p-8 text-center text-muted-foreground">لا توجد منتجات حالياً</td>
               </tr>
            )}
            {products.map(product => (
              <tr key={product.id} className="hover:bg-primary/5 transition-colors">
                <td className="p-4 font-bold">{product.name}</td>
                <td className="p-4">
                   <Badge variant="outline">{product.category.name}</Badge>
                </td>
                <td className="p-4 text-primary font-bold">{product.price} ريال</td>
                <td className="p-4">
                  <Badge variant={product.status === 'PUBLISHED' ? 'default' : 'secondary'}>
                     {product.status === 'PUBLISHED' ? 'منشور' : 'مسودة'}
                  </Badge>
                </td>
                <td className="p-4 flex gap-2">
                   <Button variant="outline" size="sm" className="h-8 w-8 p-0" title="تعديل">
                      <Edit className="w-4 h-4 text-blue-500" />
                   </Button>
                   <Button variant="outline" size="sm" className="h-8 w-8 p-0 border-destructive/50 hover:bg-destructive/10" title="حذف">
                      <Trash2 className="w-4 h-4 text-destructive" />
                   </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
