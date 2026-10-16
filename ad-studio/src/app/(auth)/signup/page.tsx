import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/server/auth/session";

export const metadata = { title: "إنشاء حساب" };
export default async function Page() {
  if (await currentUser()) redirect("/projects");
  return <AuthForm mode="signup" />;
}
