import Link from "next/link";
import { ShoppingCart, User, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeaderAuth } from "./HeaderAuth";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full glass">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gradient">ArabScripts</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/products" className="transition-colors hover:text-primary">
              المنتجات
            </Link>
            <Link href="/categories" className="transition-colors hover:text-primary">
              التصنيفات
            </Link>
            <Link href="/dashboard/licenses" className="transition-colors hover:text-primary">
              تراخيصي
            </Link>
            <Link href="/support" className="transition-colors hover:text-primary">
              الدعم الفني
            </Link>
          </nav>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-4">
          <div className="hidden md:flex relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="ابحث عن سكربت..."
              className="h-9 w-64 rounded-md border border-input bg-transparent pr-9 pl-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </div>

          <Button variant="ghost" size="icon" className="relative">
            <ShoppingCart className="h-5 w-5" />
            <span className="absolute top-0 right-0 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
              0
            </span>
          </Button>

          <HeaderAuth />

          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
