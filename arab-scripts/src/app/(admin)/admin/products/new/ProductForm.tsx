"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ProductForm({ categories }: { categories: { id: string, name: string }[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    
    // Quick validation before send
    const image = formData.get("image") as File;
    const zip = formData.get("file") as File;
    
    if (image.size === 0 || zip.size === 0) {
       setError("يجب اختيار الصورة وملف الـ ZIP");
       setLoading(false);
       return;
    }
    
    if (!image.type.startsWith("image/")) {
       setError("يجب أن يكون ملف الصورة بصيغة صحيحة (png, jpg, etc)");
       setLoading(false);
       return;
    }
    
    if (!zip.name.endsWith(".zip") && !zip.name.endsWith(".rar")) {
       setError("يجب أن يكون الملف بصيغة ZIP أو RAR");
       setLoading(false);
       return;
    }

    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        body: formData, // the browser sets correct content-type for multipart
      });
      const data = await res.json();

      if (res.ok) {
        router.push("/admin/products");
        router.refresh();
      } else {
        setError(data.error || "خطأ غير معروف");
      }
    } catch (err) {
      setError("حدث خطأ في الاتصال بالسيرفر");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {error && <div className="p-4 bg-destructive/20 text-destructive rounded-lg border border-destructive/50">{error}</div>}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <label className="flex flex-col gap-2">
          <span className="font-bold text-sm">اسم المنتج (سيعرض للعميل)</span>
          <input required name="name" className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none" placeholder="مثال: نظام الإسعاف المتطور" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-bold text-sm">الرابط الفرعي (Slug) (اختياري)</span>
          <input name="slug" className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none text-left" dir="ltr" placeholder="advanced-ems-system" />
        </label>
        
        <label className="flex flex-col gap-2">
          <span className="font-bold text-sm">السعر (بالريال)</span>
          <input required name="price" type="number" step="0.01" className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none text-left" dir="ltr" placeholder="250" />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-bold text-sm">السعر قبل الخصم (اختياري)</span>
          <input name="compareAtPrice" type="number" step="0.01" className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none text-left" dir="ltr" placeholder="300" />
        </label>

        <label className="flex flex-col gap-2 md:col-span-2">
          <span className="font-bold text-sm">التصنيف</span>
          <select required name="categoryId" className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none">
             <option value="">-- اختر التصنيف --</option>
             {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-2 md:col-span-2">
          <span className="font-bold text-sm">وصف مختصر</span>
          <input required name="shortDesc" className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none" placeholder="وصف قصير للمنتج" />
        </label>
        
        <label className="flex flex-col gap-2 md:col-span-2">
          <span className="font-bold text-sm">وصف كامل</span>
          <textarea required name="longDesc" rows={5} className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none resize-y" placeholder="اكتب تفاصيل المنتج ومميزاته هنا..." />
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-bold text-sm">نوع المنتج</span>
          <select name="type" className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none">
             <option value="SCRIPT">سكربت برمجي (SCRIPT)</option>
             <option value="UI">واجهة مستخدم (UI)</option>
             <option value="MLO">مباني وخرائط (MLO)</option>
             <option value="BUNDLE">باقة كاملة (BUNDLE)</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-bold text-sm">التوافق</span>
          <select name="compatibility" className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none">
             <option value="ESX">ESX</option>
             <option value="QBCORE">QBCore</option>
             <option value="STANDALONE">Standalone</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-bold text-sm">الإصدار</span>
          <input name="version" className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none text-left" dir="ltr" defaultValue="v1.0.0" />
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-bold text-sm">حالة المنتج</span>
          <select name="status" className="p-3 rounded-xl bg-background border border-border focus:border-primary outline-none">
             <option value="PUBLISHED">منشور وجاهز للبيع (PUBLISHED)</option>
             <option value="DRAFT">مسودة مخفية (DRAFT)</option>
          </select>
        </label>
        
        <div className="flex flex-col gap-4 p-4 border border-border rounded-xl bg-black/20 md:col-span-2 mt-4">
           <h3 className="font-bold text-primary mb-2">الملفات المرفقة</h3>
           
           <label className="flex flex-col gap-2">
             <span className="font-bold text-sm text-muted-foreground">صورة المنتج الأساسية (PNG/JPG)</span>
             <input required type="file" name="image" accept="image/*" className="p-2 file:rounded-lg file:border-0 file:bg-primary/20 file:text-primary file:px-4 file:py-2 hover:file:bg-primary/30" />
           </label>
           
           <label className="flex flex-col gap-2 mt-4">
             <span className="font-bold text-sm text-muted-foreground">ملف المنتج للعميل (ZIP/RAR)</span>
             <input required type="file" name="file" accept=".zip,.rar" className="p-2 file:rounded-lg file:border-0 file:bg-green-500/20 file:text-green-500 file:px-4 file:py-2 hover:file:bg-green-500/30" />
           </label>
        </div>

        <label className="md:col-span-2 flex gap-3 items-center mt-2 cursor-pointer">
           <input type="checkbox" name="isFeatured" value="true" className="w-5 h-5 accent-primary" />
           <span className="font-bold">تمييز المنتج (عرضه في الصفحة الرئيسية)</span>
        </label>
      </div>

      <Button disabled={loading} type="submit" size="lg" className="w-full mt-6 h-14 text-lg">
        {loading ? "جاري رفع الملفات وحفظ المنتج..." : "إضافة المنتج الآن"}
      </Button>
    </form>
  );
}
