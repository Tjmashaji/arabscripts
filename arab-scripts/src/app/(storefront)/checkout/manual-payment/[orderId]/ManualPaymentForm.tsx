"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ManualPaymentForm({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    
    try {
      const res = await fetch(`/api/orders/${orderId}/submit-payment-proof`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(data.error || "حدث خطأ غير معروف");
      }
    } catch(err) {
      setError("تعذر الإرسال، يرجى المحاولة لاحقاً");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && <div className="p-4 bg-destructive/20 text-destructive text-sm font-bold border border-destructive/50 rounded-xl">{error}</div>}
      
      <label className="flex flex-col gap-2">
        <span className="font-bold">رقم العملية / رقم التحويل (يجب كتابته بدقة للاعتماد)</span>
        <input required name="paymentReference" className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none" placeholder="مثال: 9823xxxxxx" />
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-bold block">ملاحظات التحويل (اسم المحول)</span>
        <input required name="paymentNote" className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none" placeholder="تم التحويل من حساب فلان بن فلان..." />
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-bold text-muted-foreground text-sm">إثبات التحويل صوره (اختياري)</span>
        <input type="file" name="proofImage" accept="image/*" className="p-2 file:rounded-lg file:border-0 file:bg-primary/20 file:text-primary file:px-4 file:py-2 hover:file:bg-primary/30 text-sm" />
      </label>

      <Button disabled={loading} type="submit" size="lg" className="w-full text-lg mt-4 shadow-lg shadow-primary/20">
        {loading ? "جاري الإرسال..." : "تأكيد الدفع وإرسال للمراجعة"}
      </Button>
    </form>
  );
}
