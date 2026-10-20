import localFont from "next/font/local";

export const plex = localFont({
  src: [
    { path: "../../assets/fonts/IBMPlexSansArabic-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../assets/fonts/IBMPlexSansArabic-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-plex",
  display: "swap",
});

export const kufi = localFont({
  src: [{ path: "../../assets/fonts/NotoKufiArabic-ExtraBold.ttf", weight: "800", style: "normal" }],
  variable: "--font-kufi",
  display: "swap",
});
