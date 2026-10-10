import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "مساري | إدارة النقل المدرسي", description: "منصة ذكية وآمنة لإدارة وتتبع نقل الطلاب المدرسي.", manifest: "/manifest.webmanifest", icons: { icon: "/favicon.svg", apple: "/favicon.svg" } };
export const viewport: Viewport = { themeColor: "#10394b", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router: الخط يُحمَّل مرة واحدة للتطبيق كله من التخطيط الجذري */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;800&display=swap" />
    </head>
    <body className="antialiased">{children}</body>
  </html>;
}
