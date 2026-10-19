import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { ProviderError } from "@/server/providers/types";
import { googleClient, saveChannel } from "@/server/services/youtube";
import { exchangeCode, myChannel, SCOPES } from "@/server/youtube/oauth";

const back = (status: string) => NextResponse.redirect(new URL(`/settings?youtube=${status}`, env().APP_URL));

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/login", env().APP_URL));
  const jar = await cookies();
  const expected = jar.get("yt_oauth_state")?.value;
  jar.delete({ name: "yt_oauth_state", path: "/api/youtube" });
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back("denied");
  if (!expected || sp.get("state") !== expected || !sp.get("code")) return back("invalid");
  try {
    const t = await exchangeCode(googleClient(), sp.get("code")!);
    const granted = (t.scope ?? "").split(" ");
    if (!SCOPES.every((s) => granted.includes(s))) return back("scopes");
    if (!t.refresh_token) return back("no_refresh");
    saveChannel(user.id, await myChannel(t.access_token), t.refresh_token, t.scope);
    return back("connected");
  } catch (e) {
    console.error("[youtube] callback failed", e);
    return back(e instanceof ProviderError && e.userMessage.includes("قناة") ? "no_channel" : "error");
  }
}
