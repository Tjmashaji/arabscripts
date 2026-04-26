"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";

export function CheckoutButton({ productId, price }: { productId: string, price: number }) {
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
      if (res.ok) {
        // Redirect to dashboard on success
        router.push("/dashboard?success=true");
        router.refresh();
      } else {
        alert(data.error || "حدث خطأ أثناء الشراء");
      }
    } catch (error) {
      alert("حدث خطأ في الاتصال");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      size="lg" 
      className="w-full h-14 text-lg font-bold shadow-[0_0_30px_-5px_rgba(var(--primary),0.5)] flex gap-2"
      onClick={handleCheckout}
      disabled={loading}
    >
      <ShoppingCart className="w-5 h-5" />
      {loading ? "جاري إتمام الشراء..." : `شراء الآن بمبلغ ${price} ريال`}
    </Button>
  );
}
