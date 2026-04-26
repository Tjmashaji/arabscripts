"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingCart, Search, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeaderAuth } from "./HeaderAuth";

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full glass border-b border-white/5 shadow-sm">
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 hover:scale-105 transition-transform">
            <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400 drop-shadow-md">ArabScripts</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-bold">
            <Link href="/products" className="transition-all hover:text-primary hover:-translate-y-1">
              المنتجات والتصنيفات
            </Link>
            <Link href="/dashboard" className="transition-all hover:text-primary hover:-translate-y-1">
              الحساب و التراخيص
            </Link>
            <Link href="/support" className="transition-all hover:text-primary hover:-translate-y-1">
              الدعم الفني
            </Link>
          </nav>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 md:gap-5">
          <div className="hidden lg:flex relative group">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              placeholder="ابحث عن سكربت..."
              className="h-10 w-64 rounded-full border border-input/50 bg-background/50 pr-10 pl-4 py-1 text-sm shadow-inner transition-all hover:border-primary/50 focus-visible:w-72 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-background"
            />
          </div>

          <Button variant="ghost" size="icon" className="relative hover:bg-primary/10 hover:text-primary transition-colors hover:scale-105">
            <ShoppingCart className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-xs font-bold text-primary-foreground flex items-center justify-center shadow-md">
              0
            </span>
          </Button>

          <HeaderAuth />

          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden hover:bg-white/10"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-20 left-0 w-full bg-background/95 backdrop-blur-xl border-b border-border/50 shadow-2xl flex flex-col items-center py-6 gap-6 animate-in slide-in-from-top-4">
          <Link onClick={() => setIsMobileMenuOpen(false)} href="/products" className="text-lg font-bold hover:text-primary">المنتجات والتصنيفات</Link>
          <Link onClick={() => setIsMobileMenuOpen(false)} href="/dashboard" className="text-lg font-bold hover:text-primary">حسابي وتراخيصي</Link>
          <Link onClick={() => setIsMobileMenuOpen(false)} href="/support" className="text-lg font-bold hover:text-primary">الدعم الفني</Link>
          
          <div className="w-11/12 h-px bg-border/50 my-2"></div>
          
          <div className="relative w-11/12">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="ابحث عن سكربت..."
              className="h-12 w-full rounded-2xl border border-input/50 bg-background/80 pr-12 pl-4 py-2 text-md shadow-inner focus-visible:outline-none focus-visible:border-primary"
            />
          </div>
        </div>
      )}
    </header>
  );
}
