import type { ReactNode } from "react";
import { localeFrom } from "@/i18n/locales";
import { requireSession } from "@/lib/auth";

export default async function CarrierLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  await requireSession(await localeFrom(params), "/carrier");
  return children;
}
