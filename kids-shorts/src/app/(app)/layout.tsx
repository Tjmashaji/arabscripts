import { AppNav } from "@/components/app-nav";
import { requireUser } from "@/server/auth/session";

// كل صفحات التطبيق محمية: لا جلسة = تحويل لتسجيل الدخول. الصلاحيات تُفرض أيضًا في كل مسار API.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex-1 flex flex-col">
      <AppNav user={{ name: user.name }} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
