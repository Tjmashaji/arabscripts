// لوحة إدارة النظام: لمدير النظام فقط (is_admin)، والقراءة عبر سياسات RLS الخاصة بالمدير.
import { withUser } from "@/server/db";
import { errors } from "@/server/http/errors";
import { handler } from "@/server/http/route";

export const GET = handler(async ({ user }) => {
  if (!user.isAdmin) throw errors.forbidden();
  return withUser(user.id, async (tx) => ({
    users: (await tx.one<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE deleted_at IS NULL"))!.n,
    workspaces: (await tx.one<{ n: number }>("SELECT count(*)::int AS n FROM workspaces"))!.n,
    jobs_by_status: await tx.q("SELECT status, count(*)::int AS n FROM ai_jobs WHERE created_at > now() - interval '7 days' GROUP BY status ORDER BY status"),
    recent_failures: await tx.q("SELECT id, type, provider, error, created_at FROM ai_jobs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 20"),
    month_spend_cents: (await tx.one<{ n: number }>("SELECT coalesce(sum(amount_cents), 0)::int AS n FROM usage_ledger WHERE entry_type = 'charge' AND created_at >= date_trunc('month', now())"))!.n,
  }));
});
