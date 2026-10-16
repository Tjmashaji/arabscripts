"use client";
import { Badge, Card, Notice, PageHeader, Spinner } from "./ui";
import { fmtDate, fmtMoney, useData } from "@/lib/client";

type Overview = { users: number; workspaces: number; jobs_by_status: { status: string; n: number }[]; recent_failures: { id: string; type: string; provider: string; error: string; created_at: string }[]; month_spend_cents: number };

export function AdminOverview() {
  const { data, loading, error } = useData<Overview>("/api/admin/overview");
  return (
    <>
      <PageHeader title="إدارة النظام" subtitle="نظرة عامة على الاستخدام والأعطال. متاحة لمدير النظام فقط." />
      {loading ? <Spinner /> : error ? <Notice tone="danger">{error.message}</Notice> : data ? (
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><p className="text-sm text-muted">المستخدمون</p><p className="font-display text-2xl">{data.users}</p></Card>
            <Card><p className="text-sm text-muted">مساحات العمل</p><p className="font-display text-2xl">{data.workspaces}</p></Card>
            <Card><p className="text-sm text-muted">إنفاق المزودين هذا الشهر</p><p className="font-display text-2xl ltr text-end">{fmtMoney(data.month_spend_cents)}</p></Card>
          </div>
          <Card><h2 className="font-bold mb-3">المهام خلال 7 أيام</h2><div className="flex flex-wrap gap-2">{data.jobs_by_status.map((s) => <Badge key={s.status}>{s.status}: {s.n}</Badge>)}</div></Card>
          <Card>
            <h2 className="font-bold mb-3">آخر الأعطال</h2>
            {!data.recent_failures.length ? <p className="text-sm text-muted">لا أعطال.</p> : (
              <ul className="divide-y divide-line text-sm">{data.recent_failures.map((f) => <li key={f.id} className="py-2"><span className="font-bold">{f.type}</span> · <span className="ltr">{f.provider}</span> · <span className="text-muted text-xs">{fmtDate(f.created_at)}</span><p className="text-danger text-xs">{f.error}</p></li>)}</ul>
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}
