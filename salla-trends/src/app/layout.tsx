import type { Metadata } from "next";
import { kufi, plex } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "رادار الترند لتجار سلة", template: "%s · رادار الترند" },
  description: "اعرف ما يبيعه السوق الآن: المنتجات الصاعدة والأكثر مبيعًا في منطقتك، من مبيعات حقيقية لمتاجر سلة، مجمعة ومجهولة المصدر.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" className={`${plex.variable} ${kufi.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
