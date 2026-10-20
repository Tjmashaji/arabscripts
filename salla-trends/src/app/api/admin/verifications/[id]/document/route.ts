import { z } from "zod";
import { currentViewer } from "@/server/auth/session";
import { asAdmin } from "@/server/db";

// وثيقة التوثيق للمسؤول فقط. sandbox وnosniff يمنعان تنفيذ أي محتوى نشط حتى لو كان الملف ملغومًا.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = await currentViewer();
  if (v?.kind !== "admin") return new Response("forbidden", { status: 403 });
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return new Response("not found", { status: 404 });
  const doc = await asAdmin(v.adminId, (tx) =>
    tx.one<{ document: Buffer; document_mime: string; document_name: string }>("SELECT document, document_mime, document_name FROM verification_requests WHERE id = $1", [id.data]),
  );
  if (!doc) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(doc.document), {
    headers: {
      "content-type": doc.document_mime,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.document_name)}`,
      "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
