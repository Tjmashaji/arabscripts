import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// عرض مستند تحقق خاص: يُسجَّل الفتح في سجل التدقيق، ثم تحويل إلى رابط مؤقت لدقيقة واحدة.
// قاعدة البيانات ترفض من لا يملك صلاحية (عضو المنشأة أو مراجع الاعتماد فقط).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: path, error } = await supabase.rpc("ap_log_document_access", { p_doc: id });
  if (error || typeof path !== "string") return new NextResponse("Forbidden", { status: 403 });

  const { data: signed, error: signError } = await supabase.storage.from("ap-verification-docs").createSignedUrl(path, 60);
  if (signError || !signed) return new NextResponse("Unavailable", { status: 502 });
  return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
