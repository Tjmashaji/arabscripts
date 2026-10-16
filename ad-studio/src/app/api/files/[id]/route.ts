// تقديم الملفات: إما برابط موقّع مؤقت، أو بجلسة مستخدم عضو في مساحة الملف (تتحقق RLS).
// يدعم طلبات Range لتشغيل الفيديو والتنقل داخله.
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth/session";
import { withUser } from "@/server/db";
import { errors, toResponse } from "@/server/http/errors";
import { isUuid } from "@/server/http/scope";
import { storage } from "@/server/media/storage";
import { verifySignature } from "@/server/services/media";
import { workerTxReadOnlyAsset } from "@/server/services/files";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) throw errors.notFound("الملف");
    const sp = req.nextUrl.searchParams;
    let asset: { storage_key: string; mime_type: string; original_name: string } | undefined;
    if (verifySignature(id, sp.get("exp"), sp.get("sig"))) {
      asset = await workerTxReadOnlyAsset(id);
    } else {
      const user = await currentUser();
      if (!user) throw errors.unauthorized();
      asset = await withUser(user.id, (tx) => tx.one("SELECT storage_key, mime_type, original_name FROM media_assets WHERE id = $1 AND deleted_at IS NULL", [id]));
    }
    if (!asset) throw errors.notFound("الملف");
    const store = storage();
    const size = await store.size(asset.storage_key);
    const headers: Record<string, string> = {
      "content-type": asset.mime_type,
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    };
    if (sp.get("download") === "1") headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(asset.original_name || "file")}`;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
      const stream = Readable.toWeb(store.read(asset.storage_key, { start, end })) as ReadableStream;
      return new NextResponse(stream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
    }
    return new NextResponse(Readable.toWeb(store.read(asset.storage_key)) as ReadableStream, { status: 200, headers: { ...headers, "content-length": String(size) } });
  } catch (e) {
    return toResponse(e);
  }
}
