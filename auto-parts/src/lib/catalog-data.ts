import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Named } from "@/lib/catalog";

export type Brand = Named & { id: string; slug: string };
export type Model = { id: string; brand_id: string; name: string; name_ar: string | null; year_from: number | null; year_to: number | null; enabled: boolean };
export type Category = Named & { id: string; slug: string };

// العلامات والموديلات والفئات المفعّلة (RLS تعرض غير المفعّل للإدارة فقط).
export const getCatalog = cache(async () => {
  const supabase = await createClient();
  const [{ data: brands }, { data: models }, { data: categories }] = await Promise.all([
    supabase.from("ap_vehicle_brands").select("id, slug, name_ar, name_en, name_zh").order("sort_order"),
    supabase.from("ap_vehicle_models").select("id, brand_id, name, name_ar, year_from, year_to, enabled").order("name"),
    supabase.from("ap_categories").select("id, slug, name_ar, name_en, name_zh").order("sort_order"),
  ]);
  return { brands: (brands ?? []) as Brand[], models: (models ?? []) as Model[], categories: (categories ?? []) as Category[] };
});

export function modelLabel(m: Model, locale: string): string {
  return locale === "ar" && m.name_ar ? m.name_ar : m.name;
}
