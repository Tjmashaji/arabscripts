// إنشاء المهام غير المتزامنة: منع التكرار بمفتاح idempotency، وحماية التكلفة بسقف الإنفاق الشهري.
// التنفيذ الفعلي يتم في العامل الخلفي (src/worker) وليس داخل طلب HTTP.
import type { Tx } from "../db";
import { errors } from "../http/errors";
import { providerFor, type Capability } from "../providers/registry";
import type { ProviderInfo } from "../providers/types";
import { assertCanEdit, type Workspace } from "./core";

export type JobType = "director" | "analyze_media" | "generate_video" | "generate_image" | "generate_speech" | "export";

const CAPABILITY: Record<JobType, Capability | null> = {
  director: "director",
  analyze_media: "analysis",
  generate_video: "video",
  generate_image: "image",
  generate_speech: "speech",
  export: null,
};

const UNAVAILABLE: Record<Capability, string> = {
  director: "المخرج الإبداعي غير متصل. أضف مفتاح Anthropic من إعدادات الخادم.",
  analysis: "خدمة تحليل الوسائط غير متصلة. أضف مفتاح Anthropic لتفعيلها.",
  video: "خدمة توليد الفيديو غير متصلة. أضف مفتاح Runway، أو استخدم مقاطعك المرفوعة.",
  image: "خدمة توليد الصور غير متصلة.",
  speech: "خدمة التعليق الصوتي غير متصلة. أضف مفتاح ElevenLabs، أو ارفع تسجيلًا صوتيًا.",
};

export type JobRow = {
  id: string;
  type: JobType;
  status: "queued" | "processing" | "completed" | "failed" | "cancelled";
  provider: string;
  progress: string | null;
  progress_label: string | null;
  error: string | null;
  is_simulated: boolean;
  cost_cents: number | null;
  cost_is_estimate: boolean;
  attempts: number;
  output: Record<string, unknown> | null;
  input: Record<string, unknown>;
  project_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export async function enqueueJob(
  tx: Tx,
  args: { ws: Workspace; userId: string; projectId: string | null; type: JobType; input: Record<string, unknown>; idempotencyKey: string; estimatedCents?: number; provider?: { info: ProviderInfo } },
): Promise<{ job: JobRow; created: boolean }> {
  assertCanEdit(args.ws);
  if (!/^[\w:.-]{8,200}$/.test(args.idempotencyKey)) throw errors.invalid("مفتاح منع التكرار غير صالح.");

  // نفس الطلب أُرسل سابقًا: نعيد المهمة نفسها بلا إنشاء جديد ولا خصم جديد
  const existing = await tx.one<JobRow>("SELECT * FROM ai_jobs WHERE workspace_id = $1 AND idempotency_key = $2", [args.ws.id, args.idempotencyKey]);
  if (existing) return { job: existing, created: false };

  const cap = CAPABILITY[args.type];
  let provider = "ffmpeg";
  let simulated = false;
  if (cap) {
    const p = args.provider ?? providerFor(cap);
    if (!p) throw errors.unavailable(UNAVAILABLE[cap]);
    provider = p.info.id;
    simulated = p.info.mode === "simulation";
  }

  if (!simulated && (args.estimatedCents ?? 0) > 0) {
    const spent = (await tx.one<{ v: number }>("SELECT app.month_spend_cents($1) AS v", [args.ws.id]))!.v;
    if (spent + (args.estimatedCents ?? 0) > args.ws.monthly_spend_cap_cents) {
      throw errors.payment(`تجاوز سقف الإنفاق الشهري لمساحتك (${(args.ws.monthly_spend_cap_cents / 100).toFixed(2)}$). ارفع السقف من الإعدادات أو انتظر الشهر القادم.`);
    }
  }

  const job = await tx.one<JobRow>(
    `INSERT INTO ai_jobs (workspace_id, project_id, user_id, type, provider, input, idempotency_key, is_simulated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (workspace_id, idempotency_key) DO NOTHING RETURNING *`,
    [args.ws.id, args.projectId, args.userId, args.type, provider, args.input, args.idempotencyKey, simulated],
  );
  if (job) return { job, created: true };
  // سباق بين طلبين متزامنين بنفس المفتاح
  const again = await tx.one<JobRow>("SELECT * FROM ai_jobs WHERE workspace_id = $1 AND idempotency_key = $2", [args.ws.id, args.idempotencyKey]);
  return { job: again!, created: false };
}

export async function requestCancel(tx: Tx, ws: Workspace, jobId: string) {
  assertCanEdit(ws);
  const row = await tx.one<{ status: string }>("UPDATE ai_jobs SET cancel_requested = true WHERE id = $1 AND status IN ('queued', 'processing') RETURNING status", [jobId]);
  if (!row) throw errors.conflict("لا يمكن إلغاء مهمة منتهية.");
}

export function listJobs(tx: Tx, filter: { projectId?: string; wsId: string; limit?: number }) {
  return tx.q<JobRow>(
    `SELECT * FROM ai_jobs WHERE workspace_id = $1 AND ($2::uuid IS NULL OR project_id = $2) ORDER BY created_at DESC LIMIT $3`,
    [filter.wsId, filter.projectId ?? null, filter.limit ?? 100],
  );
}

export async function getJob(tx: Tx, id: string) {
  const j = await tx.one<JobRow>("SELECT * FROM ai_jobs WHERE id = $1", [id]);
  if (!j) throw errors.notFound("المهمة");
  return j;
}
