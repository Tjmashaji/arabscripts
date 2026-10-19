// تنسيق التواريخ والمدد والأحجام بالعربية (يعمل في الخادم والمتصفح)
export const fmtDate = (s: string | number) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(new Date(s));
export const fmtSec = (ms: number | null | undefined) => (ms === null || ms === undefined ? "—" : `${(ms / 1000).toFixed(1)} ث`);
export const fmtBytes = (n: number | string) => {
  const b = Number(n);
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} م.ب` : `${Math.ceil(b / 1024)} ك.ب`;
};
