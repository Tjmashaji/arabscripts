import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { currentUser } from "@/server/auth/session";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await currentUser()) redirect("/dashboard");
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6"><Logo /></Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
