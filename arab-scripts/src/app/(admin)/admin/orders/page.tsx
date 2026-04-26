import { PrismaClient } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const prisma = new PrismaClient();

export default async function AdminOrdersPage() {
  const orders = await prisma.order.findMany({
    include: {
      user: true,
      items: { include: { product: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-20">
      <div className="flex justify-between items-center mb-10">
         <h1 className="text-4xl font-bold">إدارة الطلبات</h1>
      </div>

      <div className="bg-card/40 border border-border/50 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-primary/20 text-primary">
              <tr>
                <th className="p-4">رقم الطلب</th>
                <th className="p-4">العميل</th>
                <th className="p-4">المنتجات</th>
                <th className="p-4">الإجمالي</th>
                <th className="p-4">التاريخ</th>
                <th className="p-4">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد طلبات حتى الآن</td>
                </tr>
              )}
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-primary/5 transition-colors">
                  <td className="p-4 font-mono font-bold text-xs text-muted-foreground">{order.id}</td>
                  <td className="p-4">
                    <p className="font-bold">{order.user.name}</p>
                    <p className="text-xs text-muted-foreground">{order.user.email}</p>
                  </td>
                  <td className="p-4">
                    <ul className="list-disc list-inside">
                      {order.items.map(item => (
                        <li key={item.id} className="text-primary font-bold text-xs">{item.product.name}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="p-4 font-bold text-lg">{order.totalAmount.toFixed(2)} ر.س</td>
                  <td className="p-4 text-xs font-mono">{new Date(order.createdAt).toLocaleString('ar-SA')}</td>
                  <td className="p-4">
                    <Badge variant={order.status === 'PAID' ? 'default' : 'secondary'}>
                      {order.status === 'PAID' ? 'مدفوع' : order.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
