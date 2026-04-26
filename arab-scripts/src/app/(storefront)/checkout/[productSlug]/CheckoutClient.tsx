"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function CheckoutClient({ productId, price }: { productId: string, price: number }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      
      const data = await res.json();
      if (res.ok && data.order) {
        // Redirection to success page with order ID
        router.push(`/checkout/success?orderId=${data.order.id}`);
      } else {
        alert(data.error || "حدث خطأ أثناء إتمام عملية الدفع");
        setLoading(false);
      }
    } catch (error) {
      alert("حدث خطأ في الاتصال بالشبكة");
      setLoading(false);
    }
  };

  return (
    <Button 
      size="lg" 
      onClick={handleCheckout}
      disabled={loading}
      className="w-full h-14 text-lg font-bold shadow-[0_0_20px_-5px_rgba(var(--primary),0.6)] flex gap-2 relative overflow-hidden group"
    >
      {/* Shine effect */}
      <div className="absolute inset-0 -translate-x-full bg-white/20 group-hover:animate-[shimmer_1.5s_infinite] skew-x-12" />

      {loading ? (
        <>
          <Loader2 className="w-6 h-6 animate-spin" />
          جاري إتمام الطلب...
        </>
      ) : (
        <>
          <CreditCard className="w-5 h-5 mr-1" />
          تأكيد الدفع ({price} ريال)
        </>
      )}
    </Button>
  );
}
