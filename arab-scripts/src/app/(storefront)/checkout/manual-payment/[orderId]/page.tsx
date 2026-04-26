import { PrismaClient } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ManualPaymentForm } from "./ManualPaymentForm";
import { CopyIcon, HelpCircle } from "lucide-react";

const prisma = new PrismaClient();

export default async function ManualPaymentPage(props: { params: Promise<{ orderId: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    redirect("/login");
  }

  const order = await prisma.order.findUnique({
    where: { id: params.orderId, userId: session.user.id },
    include: { items: { include: { product: true } } }
  });

  if (!order || order.status !== "PENDING_PAYMENT") {
    // If not pending, it might be already reviewed or paid.
    redirect("/dashboard");
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-20 flex flex-col gap-10">
      <div className="text-center">
        <h1 className="text-4xl font-black text-primary mb-4">تعليمات الدفع اليدوي</h1>
        <p className="text-muted-foreground">قم بتحويل مبلغ <span className="font-bold text-white">{order.totalAmount} ر.س</span> لتأكيد طلبك رقم <span className="font-mono text-xs">{order.id}</span></p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Payment details */}
        <div className="glass-card p-8 rounded-2xl flex flex-col justify-center">
            <h3 className="text-2xl font-bold mb-6 text-primary flex items-center gap-2">
               معلومات التحويل البنكي
            </h3>
            
            <div className="space-y-6">
              <div className="flex flex-col gap-1 border-b border-border/50 pb-4">
                 <span className="text-sm text-muted-foreground">البنك:</span>
                 <span className="font-bold text-lg">مصرف الراجحي (Al Rajhi Bank)</span>
              </div>
              <div className="flex flex-col gap-1 border-b border-border/50 pb-4">
                 <span className="text-sm text-muted-foreground">اسم الحساب:</span>
                 <span className="font-bold text-lg">منصة عرب سكربتس</span>
              </div>
              <div className="flex flex-col gap-1 border-b border-border/50 pb-4">
                 <span className="text-sm text-muted-foreground">رقم الحساب (IBAN):</span>
                 <span className="font-bold text-lg font-mono tracking-widest">SA12345678901234567890</span>
              </div>
              <div className="flex flex-col gap-1 pb-4">
                 <span className="text-sm text-muted-foreground">STC Pay:</span>
                 <span className="font-bold text-lg font-mono tracking-widest">05XXXXXXXX</span>
              </div>
            </div>

            <div className="mt-8 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex gap-3 text-sm text-yellow-500/90 leading-relaxed font-bold">
               <HelpCircle className="w-6 h-6 flex-shrink-0" />
               <p>بمجرد إرسالك لنموذج تأكيد الدفع، سيقوم فريق الإدارة بمراجعته فوراً، وسيتم إصدار مفتاح التفعيل وفتح التحميل أوتوماتيكياً في حسابك.</p>
            </div>
        </div>

        {/* Confirmation Form */}
        <div className="bg-card/40 border border-border/50 p-8 rounded-2xl shadow-lg">
           <h3 className="text-2xl font-bold mb-6">أدخل بيانات التحويل</h3>
           <ManualPaymentForm orderId={order.id} />
        </div>
      </div>
    </div>
  );
}
