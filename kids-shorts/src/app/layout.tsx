import type { Metadata } from "next";
import { kufi, plex } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "استوديو شورتس الأطفال", template: "%s · استوديو شورتس الأطفال" },
  description: "اصنع مقاطع تعليمية قصيرة للأطفال بالعربية: حروف، أرقام، ألوان وآداب، ثم انشرها على قناتك في يوتيوب.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${plex.variable} ${kufi.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
