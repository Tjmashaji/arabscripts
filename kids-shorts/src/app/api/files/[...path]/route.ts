// تقديم ملفات المشروع لصاحبه فقط، مع دعم Range لتشغيل الفيديو والتنقل داخله.
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth/session";
import { q } from "@/server/db";
import { errors, toResponse } from "@/server/http/errors";
import { abs, size as fileSize } from "@/server/storage";

const TYPES: Record<string, string> = { mp4: "video/mp4", jpg: "image/jpeg", mp3: "audio/mpeg", m4a: "audio/mp4" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  try {
    const user = await currentUser();
    if (!user) throw errors.unauthorized();
    const parts = (await ctx.params).path;
    // الشكل الوحيد المسموح: projects/<id>/<audio|renders>/<file>
    if (parts.length !== 4 || parts[0] !== "projects" || !["audio", "renders"].includes(parts[2]) || !/^[\w-]+\.(mp4|jpg|mp3|m4a)$/.test(parts[3])) throw errors.notFound("الملف");
    if (!q.get("SELECT 1 FROM projects WHERE id = ? AND user_id = ?", parts[1], user.id)) throw errors.notFound("الملف");
    const rel = parts.join("/");
    let size: number;
    try {
      size = await fileSize(rel);
    } catch {
      throw errors.notFound("الملف");
    }
    const headers: Record<string, string> = {
      "content-type": TYPES[parts[3].split(".").pop()!],
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=3600",
      "content-security-policy": "default-src 'none'; sandbox",
    };
    if (req.nextUrl.searchParams.get("download") === "1") headers["content-disposition"] = `attachment; filename="kids-short-${parts[3]}"`;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
      return new NextResponse(Readable.toWeb(createReadStream(abs(rel), { start, end })) as ReadableStream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
    }
    return new NextResponse(Readable.toWeb(createReadStream(abs(rel))) as ReadableStream, { status: 200, headers: { ...headers, "content-length": String(size) } });
  } catch (e) {
    return toResponse(e);
  }
}
