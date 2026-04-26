"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError(res.error);
      setLoading(false);
    } else {
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-32 flex flex-col items-center">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="bg-primary/20 p-4 rounded-full mb-4">
           <ShieldCheck className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-3xl font-black mb-2">تسجيل الدخول</h1>
        <p className="text-muted-foreground">مرحباً بك مجدداً في منصة ArabScripts</p>
      </div>

      <div className="glass-card w-full p-8 rounded-2xl shadow-xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/30">{error}</div>}
          
          <label className="flex flex-col gap-2">
            <span className="font-bold text-sm">البريد الإلكتروني</span>
            <input 
              required 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="p-3 rounded-xl bg-background/50 border border-border focus:border-primary outline-none transition-colors text-left dir-ltr" 
              dir="ltr"
              placeholder="name@example.com" 
            />
          </label>
          
          <label className="flex flex-col gap-2">
            <span className="font-bold text-sm">كلمة المرور</span>
            <input 
              required 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="p-3 rounded-xl bg-background/50 border border-border focus:border-primary outline-none transition-colors text-left dir-ltr" 
              dir="ltr"
              placeholder="••••••••" 
            />
          </label>

          <Button type="submit" disabled={loading} size="lg" className="h-12 w-full mt-2 text-md font-bold shadow-[0_0_20px_-5px_rgba(var(--primary),0.5)]">
            {loading ? "جاري التحقق..." : "دخول المنصة"}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          ليس لديك حساب؟ <Link href="/register" className="text-primary hover:underline font-bold">سجل الآن</Link>
        </div>
      </div>
    </div>
  );
}
