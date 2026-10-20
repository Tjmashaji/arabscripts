import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { csvCell } from "@/lib/shipping";

const columns = ["reference", "created_at", "status", "payment_status", "currency", "total", "part_amount", "shipping_amount",
  "customs_tax_amount", "service_fee", "discount", "city"] as const;

// تصدير الطلبات CSV لمن يملك reports.read (تتحقق قاعدة البيانات). بلا أسماء أو أرقام عملاء.
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return new NextResponse("Bad range", { status: 400 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Unauthorized", { status: 401 });
  const { data, error } = await supabase.rpc("ap_report_orders", { p_from: from, p_to: to });
  if (error) return new NextResponse("Forbidden", { status: 403 });
  const rows = (data ?? []) as Record<(typeof columns)[number], unknown>[];
  // BOM حتى يفتح Excel الحروف العربية بشكل صحيح.
  const body = "﻿" + [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join("\r\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${from}-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
