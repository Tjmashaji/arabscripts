// فحص الصحة لمنصة الاستضافة: يتأكد أن التطبيق يعمل ويصل إلى قاعدة البيانات
import { anonymous } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await anonymous((tx) => tx.q("SELECT 1"));
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
