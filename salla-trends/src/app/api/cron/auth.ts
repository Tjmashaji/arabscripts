import type { NextRequest } from "next/server";
import { safeEqual } from "@/server/crypto";
import { env } from "@/server/env";

// Vercel Cron يرسل CRON_SECRET في ترويسة Authorization تلقائيًا
export function cronAuthorized(req: NextRequest) {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  return safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`);
}
