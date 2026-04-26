import type { Metadata } from "next";
import { Inter, Cairo } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const cairo = Cairo({ subsets: ["arabic"], variable: "--font-cairo" });

export const metadata: Metadata = {
  title: "ArabScripts | منصة بيع سكربتات وملفات FiveM",
  description: "المنصة العربية الأولى والأكثر احترافية لبيع كل ما يتعلق بسيرفرات فايف ام وحلول الرول بلاي في مكان واحد.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <body
        className={`${inter.variable} ${cairo.variable} font-arabic antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        <Providers>
          <div className="relative flex flex-col min-h-screen">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
