import { LayoutDashboard, Users, ShoppingCart, Key, Package, Settings, LogOut } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-l border-border/50 glass hidden md:flex flex-col">
        <div className="p-6 border-b border-border/50">
          <span className="text-xl font-black text-primary">إدارة ArabScripts</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <NavItem href="/admin" icon={<LayoutDashboard size={20} />} label="الرئيسية" />
          <NavItem href="/admin/products" icon={<Package size={20} />} label="المنتجات" />
          <NavItem href="/admin/orders" icon={<ShoppingCart size={20} />} label="الطلبات" />
          <NavItem href="/admin/licenses" icon={<Key size={20} />} label="التراخيص" />
          <NavItem href="/admin/customers" icon={<Users size={20} />} label="العملاء" />
          <NavItem href="/admin/settings" icon={<Settings size={20} />} label="الإعدادات" />
        </nav>
        <div className="p-4 border-t border-border/50">
          <Button variant="ghost" className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="mr-2" size={20} />
            تسجيل خروج
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

function NavItem({ href, icon, label }: { href: string, icon: React.ReactNode, label: string }) {
  return (
    <Link href={href}>
      <span className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-primary/10 transition-colors text-muted-foreground hover:text-foreground">
        {icon}
        <span className="font-medium text-sm">{label}</span>
      </span>
    </Link>
  );
}
