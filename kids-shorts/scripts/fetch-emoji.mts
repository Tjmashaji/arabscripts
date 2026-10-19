// تنزيل رسوم Twemoji المستخدمة في المكتبة وتحويلها إلى PNG بدقة 512 (يُشغَّل مرة عند تعديل القائمة)
// npx tsx scripts/fetch-emoji.mts
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { EMOJI_LIST, emojiFile } from "../src/lib/emoji.ts";

const OUT = path.resolve("assets/emoji");
const BASE = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/";
mkdirSync(OUT, { recursive: true });

for (const e of EMOJI_LIST) {
  const name = emojiFile(e);
  const png = path.join(OUT, `${name}.png`);
  if (existsSync(png)) continue;
  // بعض تسلسلات ZWJ تحتفظ بـ fe0f في اسم الملف لدى Twemoji
  const candidates = [name, [...e].map((c) => c.codePointAt(0)!.toString(16)).join("-")];
  let svg: string | null = null;
  for (const c of candidates) {
    const r = await fetch(BASE + c + ".svg");
    if (r.ok) { svg = await r.text(); break; }
  }
  if (!svg) { console.error("missing", e, name); process.exitCode = 1; continue; }
  const tmp = path.join(os.tmpdir(), `${name}.svg`);
  writeFileSync(tmp, svg);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-width", "512", "-height", "512", "-i", tmp, png]);
  rmSync(tmp);
}
console.log("done", EMOJI_LIST.length);
