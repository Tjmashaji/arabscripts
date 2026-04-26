"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, User, LayoutDashboard, ShieldAlert } from "lucide-react";
import Link from "next/link";

export function HeaderAuth() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <div className="h-10 w-24 bg-primary/20 animate-pulse rounded-md" />;
  }

  if (session && session.user) {
    return (
      <div className="flex items-center gap-3">
        {session.user.role === "ADMIN" && (
           <Link href="/admin">
             <Button variant="destructive" size="sm" className="gap-2 font-bold shadow-lg shadow-destructive/20 hidden lg:flex">
               <ShieldAlert className="w-4 h-4" /> لوحة الإدارة
             </Button>
           </Link>
        )}
        <Link href="/dashboard">
          <Button variant="outline" size="sm" className="gap-2 border-primary/30">
            <LayoutDashboard className="w-4 h-4 text-primary" /> لوحة العميل
          </Button>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => signOut()} title="تسجيل الخروج">
          <LogOut className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    );
  }

  return (
    <Button variant="secondary" className="flex gap-2 hover:scale-105 transition-transform" onClick={() => signIn()}>
      <User className="h-4 w-4" />
      <span className="hidden sm:inline">تسجيل الدخول</span>
    </Button>
  );
}
