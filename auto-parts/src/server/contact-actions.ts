"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { localePath, requireStaff } from "@/lib/auth";
import { formLocale, text } from "./form";

const fail = (message: string) => `error=${encodeURIComponent(message.replace(/^ap: /, "").replace(/\s+/g, "_"))}`;

// إعادة مكالمة المساعد الآلي من صفحة الطلب أو التسعيرة. الصلاحية تتحقق منها قاعدة البيانات.
export async function requeueContact(form: FormData) {
  const locale = formLocale(form);
  const given = text(form, "back", 100);
  const back = /^\/admin\/(orders|quotes)\/[0-9a-f-]{36}$/.test(given) ? given : "/admin";
  const page = localePath(locale, back);
  await requireStaff(locale, back);
  const job = z.uuid().safeParse(text(form, "jobId", 64));
  if (!job.success) redirect(`${page}?error=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("ap_admin_requeue_contact", { p_job: job.data });
  revalidatePath("/[locale]/admin", "layout");
  redirect(`${page}?${error ? fail(error.message) : "done=1"}#contact`);
}
