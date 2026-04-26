import { PrismaClient } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Download, KeyRound, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

export default async function CustomerDashboardPage() {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    redirect("/login");
  }

  const user = session.user;

  const orders = await prisma.order.findMany({
    where: { userId: user.id },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' }
  });

  const licenses = await prisma.license.findMany({
    where: { userId: user.id },
    include: { product: { include: { files: true } } },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-20">
      <div className="flex items-center justify-between mb-10 border-b border-border/50 pb-6">
         <div>
           <h1 className="text-4xl font-bold mb-2">لوحة التحكم</h1>
           <p className="text-muted-foreground">أهلاً بك، {user.name} في حسابك الخاص</p>
         </div>
         <Badge className="bg-primary/20 text-primary hover:bg-primary/30 text-lg px-4 py-1">
            عميل
         </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Licenses Section */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <KeyRound className="text-primary w-6 h-6" />
            <h2 className="text-2xl font-bold">تراخيصي</h2>
          </div>
          <div className="flex flex-col gap-4">
            {licenses.length === 0 && <p className="text-muted-foreground">لا توجد تراخيص حالياً</p>}
            {licenses.map(license => (
              <Card key={license.id} className="glass-card shadow-md">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex justify-between items-center">
                    <span>{license.product.name}</span>
                    <Badge variant={license.status === 'ACTIVE' ? "default" : "destructive"}>
                      {license.status === 'ACTIVE' ? 'نشط' : 'موقوف'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 flex flex-col gap-4">
                  <div className="bg-background rounded-lg p-3 flex justify-between items-center border border-border">
                    <code className="text-primary font-mono font-bold tracking-widest">{license.key}</code>
                    <Copy className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-white" />
                  </div>
                  <div className="flex flex-col gap-2 text-sm">
                    <span className="text-muted-foreground">الاستخدامات: {license.currentUses} / {license.maxUses}</span>
                    {license.product.files.map((file) => (
                      <a key={file.id} href={`/api/download/${file.id}`} download className="block">
                        <Button size="sm" variant="outline" className="w-full gap-2 border-primary/30 hover:bg-primary hover:text-primary-foreground transition-colors group">
                          <Download className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          تحميل أحدث نسخة ({file.version})
                        </Button>
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Orders Section */}
        <section>
           <div className="flex items-center gap-2 mb-6">
            <ShoppingBag className="text-primary w-6 h-6" />
            <h2 className="text-2xl font-bold">مشترياتي السابقة</h2>
          </div>
          <div className="flex flex-col gap-4">
            {orders.length === 0 && <p className="text-muted-foreground">لم تقم بأي عملية شراء بعد</p>}
             {orders.map(order => (
              <Card key={order.id} className="bg-card/30 border-border/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex justify-between items-center text-muted-foreground font-normal">
                    <span>طلب رقم: <span className="font-mono text-xs">{order.id}</span></span>
                    
                    {order.status === 'PENDING_PAYMENT' && <Badge variant="destructive">بانتظار الدفع</Badge>}
                    {order.status === 'PENDING_REVIEW' && <Badge variant="secondary" className="text-yellow-500">بانتظار مراجعة الإدارة</Badge>}
                    {order.status === 'PAID' && <Badge variant="default" className="bg-green-500">مدفوع ومكتمل</Badge>}
                    {order.status === 'REJECTED' && <Badge variant="destructive">تم رفض الدفع</Badge>}
                    {order.status === 'CANCELED' && <Badge variant="outline">تم الإلغاء</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 flex flex-col gap-3">
                  {order.items.map(item => (
                    <div key={item.id} className="flex justify-between items-center border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <span className="font-bold">{item.product.name}</span>
                      <span className="text-primary">{item.price} ريال</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
                     <span className="font-bold">الإجمالي</span>
                     <span className="font-black text-xl">{order.totalAmount} ريال</span>
                  </div>
                  {order.status === 'PENDING_PAYMENT' && (
                    <div className="mt-4">
                       <Link href={`/checkout/manual-payment/${order.id}`}>
                         <Button className="w-full font-bold shadow-lg shadow-primary/20">تأكيد الدفع الآن</Button>
                       </Link>
                    </div>
                  )}
                  {order.status === 'REJECTED' && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-sm font-bold text-center">
                       تم رفض عملية الدفع: {order.rejectedReason || "البيانات غير صحيحة"}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>

    </div>
  );
}
