// صور مكتبة الرسوم للواجهة (نفس الملفات التي يستخدمها محرك التصدير، فالمعاينة تطابق الفيديو)
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { EMOJI_DIR } from "@/server/media/render";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  if (!/^[0-9a-f-]+\.png$/.test(file)) return new NextResponse(null, { status: 404 });
  try {
    const data = await readFile(path.join(EMOJI_DIR, file));
    return new NextResponse(new Uint8Array(data), { headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
