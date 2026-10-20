import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// صورة مرفقة بطلب تسعير (مستودع خاص). العميل صاحب الطلب والإدارة يصلون عبر RLS؛
// المورد المدعو يصل عبر ap_supplier_request_media التي تسجّل الفتح في سجل التدقيق. رابط مؤقت لدقيقة واحدة.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = request.nextUrl.searchParams.get("request") ?? "";
  const isUuid = (v: string) => /^[0-9a-f-]{36}$/.test(v);
  if (!isUuid(id) || !isUuid(requestId)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Unauthorized", { status: 401 });

  let path: string | undefined;
  const { data: own } = await supabase.from("ap_quote_request_media").select("storage_path").eq("id", id).eq("request_id", requestId).maybeSingle();
  if (own) path = own.storage_path as string;
  else {
    const { data: invited } = await supabase.rpc("ap_supplier_request_media", { p_request: requestId });
    path = ((invited ?? []) as { id: string; storage_path: string }[]).find((m) => m.id === id)?.storage_path;
  }
  if (!path) return new NextResponse("Forbidden", { status: 403 });

  const { data: signed, error } = await supabase.storage.from("ap-request-media").createSignedUrl(path, 60);
  if (error || !signed) return new NextResponse("Unavailable", { status: 502 });
  return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
