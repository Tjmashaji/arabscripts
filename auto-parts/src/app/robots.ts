import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// الصفحات العامة فقط تُفهرس؛ الحسابات واللوحات والواجهات البرمجية خارج محركات البحث.
export default function robots(): MetadataRoute.Robots {
  const privatePaths = ["/admin", "/account", "/partner", "/carrier", "/api/", "/auth/", "/invite/", "/login", "/signup",
    "/forgot-password", "/reset-password", "/request-part", "/forbidden"];
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...privatePaths, ...privatePaths.flatMap((p) => [`/en${p}`, `/zh${p}`])] }],
    sitemap: `${env.siteUrl}/sitemap.xml`,
    host: env.siteUrl,
  };
}
