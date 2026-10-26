import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { locales } from "@/i18n/locales";
import { localizedPath } from "@/lib/seo";

export const revalidate = 3600;

const staticPaths = ["/", "/products", "/about", "/how-it-works", "/faq", "/track", "/join", "/privacy", "/terms"];

// خريطة الموقع بكل اللغات مع روابط hreflang: الصفحات العامة، صفحات العلامات، والمنتجات المنشورة فقط.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false } });
  const [{ data: brands }, { data: products }] = await Promise.all([
    supabase.from("ap_vehicle_brands").select("slug").eq("enabled", true),
    supabase.from("ap_products").select("id, updated_at").eq("status", "published").order("updated_at", { ascending: false }).limit(5000),
  ]);
  const entry = (path: string, lastModified?: string, priority = 0.5): MetadataRoute.Sitemap => locales.map((l) => ({
    url: `${env.siteUrl}${localizedPath(l, path)}`,
    lastModified: lastModified ? new Date(lastModified) : undefined,
    priority,
    alternates: { languages: Object.fromEntries(locales.map((x) => [x, `${env.siteUrl}${localizedPath(x, path)}`])) },
  }));
  return [
    ...staticPaths.flatMap((p) => entry(p, undefined, p === "/" ? 1 : 0.6)),
    ...(brands ?? []).flatMap((b) => entry(`/brands/${b.slug}`, undefined, 0.8)),
    ...(products ?? []).flatMap((p) => entry(`/products/${p.id}`, p.updated_at as string, 0.7)),
  ];
}
