import type { Metadata } from "next";
import { kufi, plex } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "استوديو الإعلانات الذكي", template: "%s · استوديو الإعلانات الذكي" },
  description: "أنشئ إعلانًا احترافيًا لنشاطك من صورك ومقاطعك: فكرة، سيناريو، مشاهد، صوت، مونتاج وتصدير.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${plex.variable} ${kufi.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
