import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";

// منشآت المستخدم المعتمدة للبيع (بائع أو مورد أو مصنع)، والمنشأة نشطة. الواجهة تستخدمها للعرض فقط؛
// قاعدة البيانات تتحقق من نفس الشرط في كل عملية (ap_private.org_can_sell).
export const getSellingOrganizations = cache(async () => {
  const session = await getSession();
  if (!session || session.organizations.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("ap_organizations")
    .select("id, legal_name, trade_name, status, ap_organization_verifications(capability, status)")
    .in("id", session.organizations.map((o) => o.id))
    .eq("status", "active");
  return (data ?? [])
    .filter((o) => (o.ap_organization_verifications as { capability: string; status: string }[])
      .some((v) => v.status === "approved" && ["seller", "supplier", "manufacturer"].includes(v.capability)))
    .map((o) => ({ id: o.id as string, name: (o.trade_name || o.legal_name) as string }));
});

// منشآت المستخدم المعتمدة كناقل (للعرض فقط؛ قاعدة البيانات تتحقق عبر ap_private.carrier_member).
export const getCarrierOrganizations = cache(async () => {
  const session = await getSession();
  if (!session || session.organizations.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("ap_organizations")
    .select("id, legal_name, trade_name, ap_organization_verifications(capability, status)")
    .in("id", session.organizations.map((o) => o.id))
    .eq("status", "active");
  return (data ?? [])
    .filter((o) => (o.ap_organization_verifications as { capability: string; status: string }[])
      .some((v) => v.status === "approved" && v.capability === "carrier"))
    .map((o) => ({ id: o.id as string, name: (o.trade_name || o.legal_name) as string }));
});
