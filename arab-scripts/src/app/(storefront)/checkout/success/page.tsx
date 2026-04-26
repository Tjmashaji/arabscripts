import { PrismaClient } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CheckCircle, Download, LayoutDashboard, Copy } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SuccessCopyKey } from "./SuccessCopyKey";

const prisma = new PrismaClient();

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: { orderId?: string } }) {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user) {
    redirect("/login");
  }

  const { orderId } = searchParams;
  if (!orderId) {
    redirect("/dashboard");
  }

  // Ensure this order belongs to the logged in user
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: { include: { files: true } } } } }
  });

  if (!order || order.userId !== session.user.id) {
    notFound();
  }

  const product = order.items[0]?.product;
  
  // Find the exact license generated for this product and this user right now
  const license = await prisma.license.findFirst({
    where: { userId: session.user.id, productId: product?.id },
    orderBy: { createdAt: 'desc' }
  });

  if (!product || !license) {
    notFound();
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-24 flex flex-col items-center">
      
      {/* Success Icon */}
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full scale-150" />
        <CheckCircle className="w-24 h-24 text-green-500 relative z-10 drop-shadow-2xl" />
      </div>

      <h1 className="text-4xl md:text-5xl font-black mb-4 text-center">تمت عملية الشراء بنجاح!</h1>
      <p className="text-xl text-muted-foreground text-center mb-10 leading-relaxed max-w-lg">
        شكراً لاختيارك ArabScripts. تم تخصيص رخصة فريدة لحسابك ويمكنك البدء في تحميل وتركيب ملفاتك فوراً.
      </p>

      {/* License Card */}
      <div className="w-full glass-card p-8 rounded-3xl border-primary/20 shadow-[0_0_50px_-15px_rgba(var(--primary),0.3)] mb-10">
         <div className="flex justify-between items-center mb-6 pb-6 border-b border-border/50 text-sm">
           <span className="text-muted-foreground">رقم الطلب</span>
           <span className="font-mono bg-background px-3 py-1 rounded-md border border-border">{order.id}</span>
         </div>
         
         <div className="mb-8">
           <p className="text-muted-foreground mb-2 text-sm font-bold">المنتج الخاص بك</p>
           <p className="text-2xl font-bold text-gradient">{product.name}</p>
         </div>

         <div className="bg-background/80 flex flex-col items-center justify-center p-6 rounded-2xl border border-primary/30 relative overflow-hidden group">
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="text-sm text-primary mb-3 font-bold">مفتاح الترخيص الخاص بسيرفرك</span>
            <div className="w-full max-w-sm flex items-center justify-center gap-3">
              <code className="text-2xl md:text-3xl font-mono font-black tracking-widest text-center block w-full">{license.key}</code>
            </div>
            
            <div className="mt-6 w-full flex justify-center">
              <SuccessCopyKey licenseKey={license.key} />
            </div>
         </div>
         
         <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground bg-primary/10 inline-block px-4 py-2 rounded-lg border border-primary/20">
               ⚠️ يرجى عدم مشاركة هذا المفتاح مع أي شخص. إنه مرتبط بحسابك فقط.
            </p>
         </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
         <a href={`/api/download/${product.files?.[0]?.id}`} download className="w-full">
            <Button size="lg" className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20 gap-3">
               <Download className="w-5 h-5" />
               تحميل ملفات السكربت
            </Button>
         </a>
         
         <Link href="/dashboard" className="w-full">
            <Button size="lg" variant="outline" className="w-full h-14 text-lg font-bold gap-3 border-border hover:bg-background">
               <LayoutDashboard className="w-5 h-5 text-primary" />
               لوحة التحكم وتراخيصي
            </Button>
         </Link>
      </div>

    </div>
  );
}
