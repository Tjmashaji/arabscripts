// نصوص الفيديو بصيغة ASS: libass (مع harfbuzz وfribidi) يشكّل الحروف العربية ويضبط اتجاهها، بخلاف drawtext.
export type AssLine = { startMs: number; endMs: number; text: string; style: "Hero" | "Title" | "Caption"; size?: number };

const ts = (ms: number) => {
  const cs = Math.max(0, Math.round(ms / 10));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};
// لون ASS بصيغة &HAABBGGRR
export const assColor = (hex: string, alpha = 0) => `&H${alpha.toString(16).padStart(2, "0")}${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`.toUpperCase();
// تنظيف نص المستخدم من أوامر ASS ({} و\) حتى لا يحقن تنسيقًا
export const clean = (t: string) => t.replace(/[{}\\]/g, "").replace(/\r?\n/g, " ").trim();

// حجم النص الكبير حسب طوله: حرف واحد يملأ الشاشة، والكلمات أصغر
export function heroSize(text: string) {
  const n = [...text.replace(/\s/g, "")].length;
  return n <= 2 ? 620 : n <= 5 ? 300 : n <= 10 ? 190 : 130;
}

export function buildAss(width: number, height: number, lines: AssLine[]) {
  const k = width / 1080;
  const px = (v: number) => Math.round(v * k);
  const style = (name: string, size: number, primary: string, outline: string, back: string, borderStyle: number, outlineW: number, shadow: number, align: number, marginV: number) =>
    `Style: ${name},Noto Kufi Arabic,${px(size)},${primary},${primary},${outline},${back},-1,0,0,0,100,100,0,0,${borderStyle},${px(outlineW)},${px(shadow)},${align},${px(70)},${px(70)},${px(marginV)},1`;
  const white = assColor("#FFFFFF"), ink = assColor("#2B1E4A");
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    style("Hero", 300, white, ink, assColor("#000000", 0x90), 1, 14, 8, 5, 0),
    style("Title", 130, white, ink, assColor("#000000", 0x90), 1, 10, 6, 8, 250),
    // صندوق شبه شفاف خلف الترجمة فوق منطقة أزرار يوتيوب السفلية
    style("Caption", 62, white, assColor("#000000", 0x70), assColor("#000000", 0x70), 3, 18, 0, 2, 400),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...lines
      .filter((l) => clean(l.text) && l.endMs > l.startMs)
      .map((l) => {
        // العناوين تظهر من 88% إلى 100% بتباطؤ (accel 0.4 = ease-out) مع تلاشٍ، والترجمة بتلاشٍ ناعم فقط
        const fx = l.style === "Caption" ? "\\fad(120,80)" : `\\fad(160,120)\\fscx88\\fscy88\\t(0,280,0.4,\\fscx100\\fscy100)${l.size ? `\\fs${px(l.size)}\\bord${px(Math.min(14, l.size * 0.05))}\\shad${px(Math.min(8, l.size * 0.03))}` : ""}`;
        return `Dialogue: 0,${ts(l.startMs)},${ts(l.endMs)},${l.style},,0,0,0,,{${fx}}${clean(l.text)}`;
      }),
    "",
  ].join("\n");
}

// تقسيم التعليق إلى أسطر ترجمة قصيرة موزعة على مدة الصوت
export function splitCaption(text: string, startMs: number, durMs: number, maxWords = 6): AssLine[] {
  const words = clean(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const per = durMs / words.length;
  const out: AssLine[] = [];
  let t = startMs;
  for (let i = 0; i < words.length; i += maxWords) {
    const chunk = words.slice(i, i + maxWords);
    out.push({ startMs: t, endMs: t + chunk.length * per, text: chunk.join(" "), style: "Caption" });
    t += chunk.length * per;
  }
  return out;
}
