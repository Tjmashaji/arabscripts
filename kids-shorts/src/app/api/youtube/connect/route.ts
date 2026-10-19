import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { handler } from "@/server/http/route";
import { googleClient } from "@/server/services/youtube";
import { authUrl } from "@/server/youtube/oauth";

const STATE_COOKIE = "yt_oauth_state";

// يبدأ ربط القناة: قيمة state عشوائية في كوكي قصير العمر تمنع هجمات CSRF على رابط العودة
export const GET = handler(async () => {
  const client = googleClient();
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/youtube", maxAge: 600 });
  return NextResponse.redirect(authUrl(client, state));
});
