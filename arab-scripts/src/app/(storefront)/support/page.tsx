import { Button } from "@/components/ui/button";
import { Mail, MessageSquare } from "lucide-react";

export default function SupportPage() {
  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-20 flex flex-col items-center">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-black mb-4">مركز الدعم الفني</h1>
        <p className="text-muted-foreground text-lg">نحن هنا لمساعدتك على مدار الساعة، اختر وسيلة التواصل الأنسب لك.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mb-16">
        <div className="glass-card p-8 rounded-2xl text-center flex flex-col items-center hover:border-primary/50 transition-colors">
           <div className="bg-[#5865F2]/20 p-4 rounded-full mb-4">
              <MessageSquare className="w-10 h-10 text-[#5865F2]" />
           </div>
           <h2 className="text-2xl font-bold mb-2">سيرفر الديسكورد</h2>
           <p className="text-muted-foreground mb-6">المكان الأسرع للحصول على الدعم والتحديثات وفتح التذاكر مباشرة مع المطورين.</p>
           <a href="https://discord.gg/arabscripts-placeholder" target="_blank">
             <Button className="bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold h-12 px-8">
                الانضمام للديسكورد
             </Button>
           </a>
        </div>

        <div className="glass-card p-8 rounded-2xl text-center flex flex-col items-center hover:border-primary/50 transition-colors">
           <div className="bg-primary/20 p-4 rounded-full mb-4">
              <Mail className="w-10 h-10 text-primary" />
           </div>
           <h2 className="text-2xl font-bold mb-2">الدعم عبر البريد</h2>
           <p className="text-muted-foreground mb-6">للاستفسارات التجارية ومشاكل الحسابات أو الاسترجاع המالي تواصل معنا بريدياً.</p>
           <a href="mailto:support@arabscripts.com">
             <Button variant="outline" className="border-primary text-primary font-bold h-12 px-8 hover:bg-primary/10">
                support@arabscripts.com
             </Button>
           </a>
        </div>
      </div>

      <div className="w-full glass-card p-10 rounded-2xl">
         <h2 className="text-2xl font-bold mb-6">نموذج تواصل سريع (طُرح للبيتا)</h2>
         <form className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               <label className="flex flex-col gap-2">
                 <span className="font-bold text-sm text-foreground/80">الاسم</span>
                 <input type="text" className="p-3 rounded-lg bg-background border border-border focus:border-primary outline-none" placeholder="اكتب اسمك" />
               </label>
               <label className="flex flex-col gap-2">
                 <span className="font-bold text-sm text-foreground/80">البريد الإلكتروني للرد</span>
                 <input type="email" className="p-3 rounded-lg bg-background border border-border focus:border-primary outline-none" placeholder="user@example.com" />
               </label>
            </div>
            <label className="flex flex-col gap-2">
                 <span className="font-bold text-sm text-foreground/80">تفاصيل المشكلة</span>
                 <textarea rows={5} className="p-3 rounded-lg bg-background border border-border focus:border-primary outline-none resize-none" placeholder="اكتب تفاصيل مشكلتك هنا بوضوح لنجيب عليك أسرع..."></textarea>
            </label>
            <Button type="button" size="lg" className="h-14 font-bold text-lg cursor-not-allowed opacity-80">
               إرسال التذكرة (تجريبي لا يعمل حالياً)
            </Button>
         </form>
      </div>

    </div>
  );
}
