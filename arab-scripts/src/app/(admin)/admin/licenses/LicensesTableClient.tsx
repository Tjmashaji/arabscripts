"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Copy, ShieldBan, ShieldCheck } from "lucide-react";

export function LicensesTableClient({ initialLicenses }: { initialLicenses: any[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setLoadingId(id);
    try {
      const res = await fetch(`/api/admin/licenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch (e) {
      alert("خطأ أثناء تغيير الحالة");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <table className="w-full text-sm text-right">
      <thead className="bg-primary/20 text-primary">
        <tr>
          <th className="p-4">مفتاح الترخيص</th>
          <th className="p-4">المستخدم</th>
          <th className="p-4">المنتج</th>
          <th className="p-4 flex-col text-xs"><p>IP / Server / Resource</p></th>
          <th className="p-4">آخر تحقق</th>
          <th className="p-4">التفعيلات</th>
          <th className="p-4">الحالة</th>
          <th className="p-4">إجراءات</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/20">
        {initialLicenses.length === 0 && (
           <tr>
             <td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد تراخيص حالياً</td>
           </tr>
        )}
        {initialLicenses.map(license => (
          <tr key={license.id} className="hover:bg-primary/5 transition-colors">
            <td className="p-4 font-mono font-bold text-xs">
              <div className="flex gap-2 items-center">
                 {license.key}
                 <Copy className="w-4 h-4 cursor-pointer text-muted-foreground hover:text-primary" onClick={() => navigator.clipboard.writeText(license.key)} />
              </div>
            </td>
            <td className="p-4"><p className="font-bold">{license.user.name}</p><p className="text-xs text-muted-foreground">{license.user.email}</p></td>
            <td className="p-4 text-primary font-bold">{license.product.name}</td>
            <td className="p-4 text-xs text-muted-foreground">
               <p>{license.ipAddress || "لم يُسجل"}</p>
               <p>{license.activatedServerId || "لم يُسجل"}</p>
               <p>{license.resourceName || "-"}</p>
            </td>
            <td className="p-4 text-xs font-mono">{license.lastCheckAt ? new Date(license.lastCheckAt).toLocaleString('ar-SA') : "لم يتحقق أبدًا"}</td>
            <td className="p-4 text-center">{license.currentUses} / {license.maxUses}</td>
            <td className="p-4">
              <Badge variant={license.status === 'ACTIVE' ? 'default' : license.status === 'SUSPENDED' ? 'destructive' : 'secondary'}>
                 {license.status === 'ACTIVE' ? 'نشط' : license.status === 'SUSPENDED' ? 'موقوف' : 'ملغي'}
              </Badge>
            </td>
            <td className="p-4 flex gap-2">
               {license.status === 'ACTIVE' ? (
                 <Button disabled={loadingId === license.id} onClick={() => toggleStatus(license.id, "ACTIVE")} variant="outline" size="sm" className="h-8 p-2 border-destructive/50 text-destructive hover:bg-destructive/10" title="إيقاف">
                    <ShieldBan className="w-4 h-4 ml-1" /> إيقاف
                 </Button>
               ) : (
                 <Button disabled={loadingId === license.id} onClick={() => toggleStatus(license.id, license.status)} variant="outline" size="sm" className="h-8 p-2 border-green-500/50 text-green-500 hover:bg-green-500/10" title="تفعيل">
                    <ShieldCheck className="w-4 h-4 ml-1" /> تفعيل
                 </Button>
               )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
