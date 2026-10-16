import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/server/auth/session";
import { capabilityStatus } from "@/server/providers/registry";

// كل صفحات التطبيق محمية: لا جلسة = تحويل لتسجيل الدخول. الصلاحيات الفعلية تُفرض في الخادم وقاعدة البيانات.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const caps = capabilityStatus();
  const simulated = caps.some((c) => c.state === "simulation");
  return (
    <div className="flex-1 flex flex-col">
      <AppNav user={{ name: user.name, email: user.email, isAdmin: user.isAdmin }} simulated={simulated} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
