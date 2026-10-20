import type { Metadata } from "next";
import Link from "next/link";
import { ReviewForm } from "@/components/forms";
import { Badge, buttonCls, Card, Empty, PageHeader } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { VERIFICATION_KINDS, type VerificationKind } from "@/lib/verification";
import { requireAdmin } from "@/server/auth/session";
import { asAdmin } from "@/server/db";
import { adminVerifications } from "@/server/queries";

export const metadata: Metadata = { title: "طلبات التوثيق" };

const TABS = [{ s: "pending", l: "بانتظار المراجعة" }, { s: "approved", l: "معتمدة" }, { s: "rejected", l: "مرفوضة" }];

export default async function AdminVerifications({ searchParams }: PageProps<"/admin/verifications">) {
  const a = await requireAdmin();
  const sp = await searchParams;
  const status = TABS.some((t) => t.s === sp.status) ? String(sp.status) : "pending";
  const rows = await asAdmin(a.adminId, (tx) => adminVerifications(tx, status));
  return (
    <>
      <PageHeader title="طلبات التوثيق" subtitle="طابق الرقم والاسم مع الوثيقة، وتأكد أنها سارية. يمكنك التحقق من السجل في منصة المركز السعودي للأعمال." />
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => <Link key={t.s} href={`/admin/verifications?status=${t.s}`} className={buttonCls(t.s === status ? "primary" : "secondary")}>{t.l}</Link>)}
      </div>
      {rows.length === 0 ? <Empty title="لا طلبات" /> : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="grid gap-1 text-[15px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{r.store_name || "متجر"}</span>
                    {r.store_domain ? <span className="ltr text-sm text-muted">{r.store_domain}</span> : null}
                    <Badge>{VERIFICATION_KINDS[r.kind as VerificationKind]?.name ?? r.kind}</Badge>
                  </div>
                  <div>الرقم: <span className="ltr font-mono">{r.number}</span></div>
                  <div>الاسم في الوثيقة: {r.legal_name}</div>
                  <div className="text-sm text-muted">قُدم {dateTime(r.created_at)}{r.reviewed_at ? ` · رُوجع ${dateTime(r.reviewed_at)}` : ""}</div>
                  {r.reviewer_note ? <div className="text-sm">ملاحظة: {r.reviewer_note}</div> : null}
                  <a href={`/api/admin/verifications/${r.id}/document`} target="_blank" rel="noopener" className="mt-1 text-brand font-bold underline w-fit">فتح الوثيقة ({r.document_name})</a>
                </div>
                {r.status === "pending" ? <ReviewForm id={r.id} /> : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
