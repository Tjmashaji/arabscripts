// تحديد نوع الملف من محتواه الفعلي (البايتات الأولى) بدل الثقة باسم الملف أو نوعه المرسل.
// SVG وHTML مرفوضان لأنهما قد يحملان سكربتات.
export type Sniffed = { kind: "image" | "video" | "audio"; mime: string; ext: string };

const has = (b: Buffer, off: number, s: string) => b.subarray(off, off + s.length).toString("latin1") === s;

export function sniff(b: Buffer): Sniffed | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", mime: "image/jpeg", ext: "jpg" };
  if (has(b, 0, "\x89PNG\r\n\x1a\n")) return { kind: "image", mime: "image/png", ext: "png" };
  if (has(b, 0, "RIFF") && has(b, 8, "WEBP")) return { kind: "image", mime: "image/webp", ext: "webp" };
  if (has(b, 0, "RIFF") && has(b, 8, "WAVE")) return { kind: "audio", mime: "audio/wav", ext: "wav" };
  if (has(b, 4, "ftyp")) {
    const brand = b.subarray(8, 12).toString("latin1");
    if (brand.startsWith("M4A")) return { kind: "audio", mime: "audio/mp4", ext: "m4a" };
    if (brand === "qt  ") return { kind: "video", mime: "video/quicktime", ext: "mov" };
    if (brand.startsWith("heic") || brand.startsWith("heix") || brand === "mif1") return null;
    return { kind: "video", mime: "video/mp4", ext: "mp4" };
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { kind: "video", mime: "video/webm", ext: "webm" };
  if (has(b, 0, "ID3") || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { kind: "audio", mime: "audio/mpeg", ext: "mp3" };
  return null;
}
