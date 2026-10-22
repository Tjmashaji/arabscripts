import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/forms";
import { Logo } from "@/components/site";
import { Card } from "@/components/ui";
import { currentViewer } from "@/server/auth/session";

export const metadata: Metadata = { title: "دخول فريق المنصة", robots: { index: false } };

export default async function AdminLogin() {
  const v = await currentViewer();
  if (v?.kind === "admin") redirect("/admin");
  return (
    <main className="mx-auto w-full max-w-sm flex-1 px-4 py-12">
      <div className="mb-6"><Logo /></div>
      <Card>
        <h1 className="font-display text-xl mb-4">دخول فريق المنصة</h1>
        <AdminLoginForm />
      </Card>
    </main>
  );
}
