import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import type { Named } from "@/lib/catalog";

export type Brand = Named & { id: string; slug: string };
export type Model = { id: string; brand_id: string; name: string; name_ar: string | null; year_from: number | null; year_to: number | null; enabled: boolean };
export type Category = Named & { id: string; slug: string };

export const CATALOG_TAG = "catalog";

type Client = { from: ReturnType<typeof createAnonClient>["from"] };

async function loadCatalog(supabase: Client) {
  const [{ data: brands }, { data: models }, { data: categories }] = await Promise.all([
    supabase.from("ap_vehicle_brands").select("id, slug, name_ar, name_en, name_zh").order("sort_order"),
    supabase.from("ap_vehicle_models").select("id, brand_id, name, name_ar, year_from, year_to, enabled").order("name"),
    supabase.from("ap_categories").select("id, slug, name_ar, name_en, name_zh").order("sort_order"),
  ]);
  return { brands: (brands ?? []) as Brand[], models: (models ?? []) as Model[], categories: (categories ?? []) as Category[] };
}

// العلامات والموديلات والفئات المفعّلة: بيانات عامة واحدة لكل الزوار، فتُخزَّن مؤقتًا بين الطلبات
// (بلا كوكيز، بصلاحية الزائر) وتُحدَّث فور تعديل الإدارة للكتالوج (revalidateTag) أو كل 10 دقائق.
const cachedCatalog = unstable_cache(
  async () => loadCatalog(createAnonClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false } })),
  ["ap-catalog-v1"],
  { tags: [CATALOG_TAG], revalidate: 600 },
);

export const getCatalog = cache(() => cachedCatalog());

// للإدارة فقط: يشمل غير المفعّل (RLS تعرضه للموظفين)، بلا تخزين مؤقت.
export const getCatalogForStaff = cache(async () => loadCatalog(await createClient()));

export function modelLabel(m: Model, locale: string): string {
  return locale === "ar" && m.name_ar ? m.name_ar : m.name;
}
