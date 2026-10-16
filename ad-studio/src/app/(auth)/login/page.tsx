import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { currentUser } from "@/server/auth/session";

export const metadata = { title: "تسجيل الدخول" };
export default async function Page() {
  if (await currentUser()) redirect("/projects");
  return <AuthForm mode="login" />;
}
