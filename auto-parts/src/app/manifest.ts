import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// يجعل الموقع قابلًا للتثبيت على الجوال كتطبيق (أيقونة على الشاشة الرئيسية ويفتح بلا شريط المتصفح).
export default function manifest(): MetadataRoute.Manifest {
  const name = env.platformName ?? "منصة قطع الغيار الصينية";
  return {
    name,
    short_name: env.platformName ?? "قطع الغيار الصينية",
    description: "قطع غيار شيري وشانجان وجيتور وجيلي وهافال من موردين ومصانع موثّقين، بسعر مفصّل قبل الدفع.",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f4f2",
    theme_color: "#141414",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
