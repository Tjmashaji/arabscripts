"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";

export function OrderActions({ orderId, status }: { orderId: string, status: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (status === "PAID" || status === "REJECTED" || status === "CANCELED") {
      return <span className="text-muted-foreground text-xs font-bold">بدون إجراء</span>;
  }

  const handleAction = async (action: 'approve' | 'reject') => {
    if (!confirm(action === 'approve' ? 'هل أنت متأكد من الموافقة على الدفع وإصدار الرخصة؟' : 'هل أنت متأكد من رفض وتجاهل هذا الدفع؟')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/${action}`, { method: "PATCH" });
      if (res.ok) {
        router.refresh();
      } else {
         const data = await res.json();
         alert(data.error || "حدث خطأ");
      }
    } catch (err) {
      alert("تعذر الاتصال بالخادم");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2 justify-end">
       <Button disabled={loading} size="sm" variant="outline" className="text-green-500 border-green-500/50 hover:bg-green-500 hover:text-white" onClick={() => handleAction('approve')}>
          <CheckCircle2 className="w-4 h-4 ml-1" /> قبول
       </Button>
       <Button disabled={loading} size="sm" variant="outline" className="text-red-500 border-red-500/50 hover:bg-red-500 hover:text-white" onClick={() => handleAction('reject')}>
          <XCircle className="w-4 h-4 ml-1" /> رفض
       </Button>
    </div>
  );
}
