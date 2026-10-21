import { NextResponse } from "next/server";
import { bearer, claimJobs, contactConfig, report, sameSecret, startCall } from "@/lib/contact-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// تستدعيه قاعدة البيانات (pg_net) عند وجود مهمة اتصال جديدة، وكل 10 دقائق عبر pg_cron. محمي برمز العامل.
export async function POST(req: Request) {
  const token = contactConfig.workerToken;
  if (!sameSecret(bearer(req), token)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // بلا مفاتيح Vapi لا نستلم شيئًا، فتبقى المهام في الانتظار حتى تُضبط.
  if (!contactConfig.vapi) return NextResponse.json({ error: "calls not configured" }, { status: 503 });

  let jobs;
  try {
    // ثلاث مكالمات لكل استدعاء (كل طلب لـ Vapi حتى 15 ثانية) لتبقى ضمن حد الدالة؛ الباقي يلتقطه استدعاء لاحق.
    jobs = await claimJobs(token!, 3);
  } catch (e) {
    console.error("[contact] claim", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "claim failed" }, { status: 502 });
  }
  let started = 0;
  for (const job of jobs) {
    try {
      const callId = await startCall(job);
      await report(token!, { job: job.id, event: "started", providerRef: callId });
      started++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[contact] call", job.id, message);
      await report(token!, { job: job.id, event: "failed", error: message }).catch(() => {});
    }
  }
  return NextResponse.json({ claimed: jobs.length, started }, { headers: { "Cache-Control": "no-store" } });
}
