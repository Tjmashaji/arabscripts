// بناء ملفات ASS للنصوص والترجمة داخل الفيديو. libass (مع harfbuzz وfribidi) يتولى
// تشكيل الحروف العربية واتجاه الكتابة من اليمين لليسار بشكل صحيح، بخلاف drawtext.
export type AssLine = { startMs: number; endMs: number; text: string; style: "Caption" | "Title" | "Sim" };

const ts = (ms: number) => {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};
// ASS لون بصيغة &HAABBGGRR
const assColor = (hex: string, alpha = 0) => `&H${alpha.toString(16).padStart(2, "0").toUpperCase()}${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`.toUpperCase();
// تنظيف النص من أوامر ASS ({}) حتى لا يحقن المستخدم أوامر تنسيق
const clean = (t: string) => t.replace(/[{}\\]/g, "").replace(/\r?\n/g, "\\N");

export function buildAss(opts: {
  width: number;
  height: number;
  lines: AssLine[];
  font: string;
  color: string;
  size: number;
  box: boolean;
  position: "top" | "center" | "bottom";
}) {
  const align = opts.position === "top" ? 8 : opts.position === "center" ? 5 : 2;
  const marginV = Math.round(opts.height * (opts.position === "center" ? 0 : 0.08));
  const scale = opts.width / 1080;
  const size = Math.round(opts.size * scale);
  // BorderStyle 3 = صندوق خلف النص، 1 = حدود وظل
  const caption = `Style: Caption,${opts.font},${size},${assColor(opts.color)},${assColor(opts.color)},${assColor("#000000")},${assColor("#000000", opts.box ? 0x60 : 0x40)},-1,0,0,0,100,100,0,0,${opts.box ? 3 : 1},${opts.box ? Math.round(14 * scale) : Math.round(3 * scale)},${opts.box ? 0 : Math.round(2 * scale)},${align},${Math.round(60 * scale)},${Math.round(60 * scale)},${marginV},1`;
  const title = `Style: Title,Noto Kufi Arabic,${Math.round(size * 1.35)},${assColor("#FFFFFF")},${assColor("#FFFFFF")},${assColor("#000000")},${assColor("#000000", 0x40)},-1,0,0,0,100,100,0,0,1,${Math.round(3 * scale)},${Math.round(3 * scale)},5,${Math.round(60 * scale)},${Math.round(60 * scale)},0,1`;
  const sim = `Style: Sim,IBM Plex Sans Arabic,${Math.round(42 * scale)},${assColor("#FFFFFF")},${assColor("#FFFFFF")},${assColor("#B91C1C")},${assColor("#B91C1C", 0x30)},-1,0,0,0,100,100,0,0,3,${Math.round(10 * scale)},0,7,${Math.round(30 * scale)},${Math.round(30 * scale)},${Math.round(30 * scale)},1`;
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${opts.width}`,
    `PlayResY: ${opts.height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    caption,
    title,
    sim,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...opts.lines.filter((l) => l.text.trim() && l.endMs > l.startMs).map((l) => `Dialogue: 0,${ts(l.startMs)},${ts(l.endMs)},${l.style},,0,0,0,,${clean(l.text)}`),
    "",
  ].join("\n");
}
