import { PrismaClient } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Package, ShoppingBag, KeyRound, Users } from "lucide-react";

const prisma = new PrismaClient();

export default async function AdminDashboardPage() {
  const users = await prisma.user.count();
  const productsCount = await prisma.product.count();
  const ordersCount = await prisma.order.count();
  const licensesCount = await prisma.license.count();

  const recentOrders = await prisma.order.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { user: true, items: { include: { product: true } } }
  });

  const recentLicenses = await prisma.license.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { product: true, user: true }
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
         <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-500">لوحة تحكم الإدارة</h1>
         <div className="flex flex-wrap gap-3">
            <Link href="/admin/products" className="bg-card border border-border px-4 py-2 rounded-xl hover:bg-primary/20 hover:border-primary/50 transition-all text-sm font-bold flex items-center gap-2 shadow-sm">
               <Package className="w-4 h-4 text-blue-500" /> المنتجات
            </Link>
            <Link href="/admin/licenses" className="bg-card border border-border px-4 py-2 rounded-xl hover:bg-primary/20 hover:border-primary/50 transition-all text-sm font-bold flex items-center gap-2 shadow-sm">
               <KeyRound className="w-4 h-4 text-yellow-500" /> التراخيص
            </Link>
            <Link href="/admin/orders" className="bg-card border border-border px-4 py-2 rounded-xl hover:bg-primary/20 hover:border-primary/50 transition-all text-sm font-bold flex items-center gap-2 shadow-sm">
               <ShoppingBag className="w-4 h-4 text-green-500" /> الطلبات
            </Link>
            <Link href="/admin/customers" className="bg-card border border-border px-4 py-2 rounded-xl hover:bg-primary/20 hover:border-primary/50 transition-all text-sm font-bold flex items-center gap-2 shadow-sm">
               <Users className="w-4 h-4 text-purple-500" /> العملاء
            </Link>
            <Link href="/admin/products/new" className="bg-primary text-primary-foreground px-5 py-2 rounded-xl hover:scale-105 transition-transform text-sm font-bold flex items-center gap-2 shadow-[0_0_20px_-5px_rgba(var(--primary),0.6)] ml-2">
               + إضافة منتج
            </Link>
         </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <StatCard title="إجمالي المنتجات" value={productsCount.toString()} icon={<Package className="text-blue-500 w-8 h-8" />} />
        <StatCard title="إجمالي الطلبات" value={ordersCount.toString()} icon={<ShoppingBag className="text-green-500 w-8 h-8" />} />
        <StatCard title="التراخيص النشطة" value={licensesCount.toString()} icon={<KeyRound className="text-yellow-500 w-8 h-8" />} />
        <StatCard title="عدد العملاء" value={users.toString()} icon={<Users className="text-purple-500 w-8 h-8" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Recent Orders */}
        <section>
          <h2 className="text-2xl font-bold mb-6">أحدث الطلبات</h2>
          <div className="bg-card/40 border border-border/50 rounded-2xl overflow-hidden shadow-lg">
            <table className="w-full text-sm text-right">
              <thead className="bg-primary/10 text-primary">
                <tr>
                  <th className="p-4">العميل</th>
                  <th className="p-4">المنتج</th>
                  <th className="p-4">المبلغ</th>
                  <th className="p-4">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {recentOrders.map(order => (
                  <tr key={order.id} className="hover:bg-primary/5 transition-colors">
                    <td className="p-4 truncate max-w-[120px]">{order.user.name}</td>
                    <td className="p-4 truncate max-w-[150px]">{order.items.map(i => i.product.name).join(', ')}</td>
                    <td className="p-4 font-bold">{order.totalAmount} ريال</td>
                    <td className="p-4"><Badge variant="outline" className="text-green-500 border-green-500/30 bg-green-500/10">مكتمل</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Licenses */}
        <section>
          <h2 className="text-2xl font-bold mb-6">أحدث التراخيص</h2>
          <div className="bg-card/40 border border-border/50 rounded-2xl overflow-hidden shadow-lg">
            <table className="w-full text-sm text-right">
              <thead className="bg-primary/10 text-primary">
                <tr>
                  <th className="p-4">مفتاح الترخيص</th>
                  <th className="p-4">العميل</th>
                  <th className="p-4">المنتج</th>
                  <th className="p-4">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {recentLicenses.map(license => (
                  <tr key={license.id} className="hover:bg-primary/5 transition-colors">
                    <td className="p-4 font-mono font-bold text-primary text-xs">{license.key}</td>
                    <td className="p-4 truncate max-w-[100px]">{license.user.name}</td>
                    <td className="p-4 truncate max-w-[120px]">{license.product.name}</td>
                    <td className="p-4"><Badge variant="default" className="bg-primary/20 text-primary hover:bg-primary/30">نشط</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string, value: string, icon: React.ReactNode }) {
  return (
    <Card className="glass-card shadow-lg flex items-center justify-between p-6">
      <div>
        <p className="text-sm text-muted-foreground mb-1">{title}</p>
        <p className="text-3xl font-black">{value}</p>
      </div>
      <div className="bg-background rounded-2xl p-4 shadow-inner">
        {icon}
      </div>
    </Card>
  );
}
