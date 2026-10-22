import { NextResponse, type NextRequest } from "next/server";
import { startStoreSession } from "@/server/auth/session";
import { safeEqual } from "@/server/crypto";
import { asWorker } from "@/server/db";
import { env } from "@/server/env";
import { exchangeCode, userInfo, SallaError } from "@/server/salla/client";
import { enqueueInitialSync, saveTokens, upsertStore } from "@/server/stores";

const STATE_COOKIE = "st_oauth_state";

// رد سلة بعد موافقة التاجر: نتحقق من state، نستبدل الرمز، نعرف المتجر من user/info، ثم نفتح الجلسة.
export async function GET(req: NextRequest) {
  const base = env().APP_URL;
  const fail = (code: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${code}`, base));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/salla" });
    return res;
  };
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return fail("denied");
  const state = q.get("state") ?? "";
  const expected = req.cookies.get(STATE_COOKIE)?.value ?? "";
  const code = q.get("code");
  if (!code || !expected || !safeEqual(state, expected)) return fail("state");

  try {
    const tokens = await exchangeCode(code);
    const info = await userInfo(tokens.access_token);
    const storeId = await asWorker(async (tx) => {
      const id = await upsertStore(tx, info.merchantId, info);
      await saveTokens(tx, id, tokens);
      // متجر لم يكتمل سحب بياناته من قبل يبدأ المزامنة؛ الفهرس الفريد يمنع تكرار مهمة نشطة
      const synced = await tx.one("SELECT 1 FROM stores WHERE id = $1 AND last_synced_at IS NOT NULL", [id]);
      if (!synced) await enqueueInitialSync(tx, id);
      await tx.q("INSERT INTO audit_log (actor, action, target) VALUES ($1, 'store.login', $1)", [`store:${id}`]);
      return id;
    });
    await startStoreSession(storeId);
    const res = NextResponse.redirect(new URL("/dashboard", base));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/salla" });
    return res;
  } catch (e) {
    console.error("[oauth] callback failed", e instanceof SallaError ? `${e.kind}: ${e.message}` : e);
    return fail("salla");
  }
}
