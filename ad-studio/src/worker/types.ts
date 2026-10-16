import type { Cost } from "../server/providers/types";

export type ClaimedJob = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  user_id: string;
  type: string;
  provider: string;
  provider_job_id: string | null;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  is_simulated: boolean;
  cancel_requested: boolean;
};

// نتيجة خطوة واحدة من المعالج
export type StepResult =
  | { kind: "done"; output: Record<string, unknown>; cost: Cost }
  // المهمة ما زالت لدى المزود: أعد الاستعلام بعد مهلة دون حجز العامل
  | { kind: "wait"; delaySeconds: number; progress: number | null; label: string; providerJobId?: string; output?: Record<string, unknown> };
