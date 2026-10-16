import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 grid place-items-center px-5 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-block mb-8"><Logo /></Link>
        {children}
      </div>
    </div>
  );
}
