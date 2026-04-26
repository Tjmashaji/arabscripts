import { PrismaClient } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { OrderActions } from "./OrderActions";

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
    <div className="w-full max-w-7xl mx-auto px-4 py-20 flex flex-col gap-10">
      <div className="flex justify-between items-center bg-card p-6 rounded-2xl shadow-lg border border-border">
         <h1 className="text-3xl font-black text-primary">إدارة الطلبات (الدفع اليدوي)</h1>
      </div>

      <div className="bg-card/40 border border-border/50 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right whitespace-nowrap">
            <thead className="bg-primary/20 text-primary">
               <tr>
               <th className="p-4">العميل / الطلب</th>
               <th className="p-4">المنتجات</th>
               <th className="p-4">المبلغ</th>
               <th className="p-4">رقم التحويل</th>
               <th className="p-4">الملاحظات</th>
               <th className="p-4">التاريخ</th>
               <th className="p-4">الحالة</th>
               <th className="p-4 text-center">إجراءات المراجعة</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
               {orders.length === 0 && (
               <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد طلبات حتى الآن</td>
               </tr>
               )}
               {orders.map((order) => (
               <tr key={order.id} className="hover:bg-primary/5 transition-colors">
                  <td className="p-4">
                     <p className="font-bold">{order.user.name}</p>
                     <p className="text-xs text-muted-foreground">{order.user.email}</p>
                     <p className="font-mono text-[10px] text-muted-foreground/50 mt-1">{order.id}</p>
                  </td>
                  <td className="p-4">
                     <ul className="list-disc list-inside">
                     {order.items.map(item => (
                        <li key={item.id} className="text-primary font-bold text-xs">{item.product.name}</li>
                     ))}
                     </ul>
                  </td>
                  <td className="p-4 font-bold text-lg">{order.totalAmount.toFixed(2)}</td>
                  <td className="p-4 font-mono font-bold text-yellow-500">
                     {order.paymentReference || <span className="text-muted-foreground text-xs font-normal">غير متوفر</span>}
                     {order.paymentProofUrl && (
                        <a href={order.paymentProofUrl} target="_blank" className="block text-[10px] text-blue-400 mt-1 hover:underline">عرض الصورة المرفقة</a>
                     )}
                  </td>
                  <td className="p-4 text-xs max-w-[150px] truncate" title={order.paymentNote || ""}>
                     {order.paymentNote || '-'}
                  </td>
                  <td className="p-4 text-xs font-mono">{new Date(order.createdAt).toLocaleString('ar-SA')}</td>
                  <td className="p-4">
                     <Badge variant={order.status === 'PAID' ? 'default' : (order.status === 'PENDING_REVIEW' ? 'secondary' : 'destructive')}>
                     {order.status === 'PAID' ? 'تم الدفع والإصدار' : order.status}
                     </Badge>
                  </td>
                  <td className="p-4">
                     <OrderActions orderId={order.id} status={order.status} />
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
