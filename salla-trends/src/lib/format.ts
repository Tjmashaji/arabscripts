// تنسيق الأرقام والمبالغ والتواريخ بالعربية مع أرقام لاتينية (أوضح في الجداول)
const nf = new Intl.NumberFormat("ar-SA-u-nu-latn");
export const num = (n: number | string | null | undefined) => nf.format(Number(n ?? 0));

export const sar = (halalas: number | string | null | undefined) =>
  halalas === null || halalas === undefined
    ? "—"
    : new Intl.NumberFormat("ar-SA-u-nu-latn", { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(Number(halalas) / 100);

export const pct = (ratio: number | string | null | undefined) => {
  if (ratio === null || ratio === undefined) return null;
  const v = Number(ratio) * 100;
  return `${v > 0 ? "+" : ""}${new Intl.NumberFormat("ar-SA-u-nu-latn", { maximumFractionDigits: v >= 100 ? 0 : 1 }).format(v)}%`;
};

export const date = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(d)) : "—";

export const dateTime = (d: Date | string | null | undefined) =>
  d ? new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(d)) : "—";
