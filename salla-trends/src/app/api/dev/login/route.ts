import { NextResponse, type NextRequest } from "next/server";
import { startStoreSession } from "@/server/auth/session";
import { asWorker } from "@/server/db";

// دخول بلا سلة لمعاينة الواجهة محليًا ببيانات seed-demo. يعمل فقط في `next dev` ومع DEV_LOGIN=true، ويرد 404 في أي بيئة أخرى.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development" || process.env.DEV_LOGIN !== "true") return new NextResponse("not found", { status: 404 });
  const merchant = Number(req.nextUrl.searchParams.get("merchant") ?? "990000001");
  const store = await asWorker((tx) => tx.one<{ id: string }>("SELECT id FROM stores WHERE salla_merchant_id = $1 AND status = 'active'", [merchant]));
  if (!store) return new NextResponse("store not found (run npm run db:demo)", { status: 404 });
  await startStoreSession(store.id);
  return NextResponse.redirect(new URL("/dashboard", req.url));
}
