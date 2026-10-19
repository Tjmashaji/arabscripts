import localFont from "next/font/local";

// IBM Plex Sans Arabic (رخصة OFL) للعربية والإنجليزية؛ الصينية تعتمد خطوط النظام المعرفة في globals.css.
export const plex = localFont({
  src: [
    { path: "../fonts/IBMPlexSansArabic-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexSansArabic-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-plex",
  display: "swap",
});
