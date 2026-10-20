import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env, sallaConfigured } from "@/server/env";
import { clientIp, rateLimited } from "@/server/http";
import { authorizeUrl } from "@/server/salla/client";

const STATE_COOKIE = "st_oauth_state";

// بداية الدخول عبر سلة: state عشوائي في كوكي قصير العمر يمنع تزوير رد سلة (CSRF على OAuth)
export async function GET(req: NextRequest) {
  const base = env().APP_URL;
  if (!sallaConfigured()) return NextResponse.redirect(new URL("/login?error=not_configured", base));
  if (await rateLimited(`login:${await clientIp(req.headers)}`, env().LOGIN_LIMIT_PER_15MIN, 900)) {
    return NextResponse.redirect(new URL("/login?error=rate_limited", base));
  }
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/salla", maxAge: 600 });
  return res;
}
