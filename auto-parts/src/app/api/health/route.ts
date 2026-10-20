import { NextResponse } from "next/server";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// فحص صحة لخدمات مراقبة التوفر: يتحقق أن قاعدة البيانات ترد خلال 3 ثوانٍ (قراءة عامة واحدة، بلا بيانات خاصة).
export async function GET() {
  const started = Date.now();
  let db = false;
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/ap_locales?select=code&limit=1`, {
      headers: { apikey: env.supabaseKey },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    db = res.ok;
  } catch {
    db = false;
  }
  return NextResponse.json(
    { ok: db, db, latencyMs: Date.now() - started, region: process.env.VERCEL_REGION ?? null },
    { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
