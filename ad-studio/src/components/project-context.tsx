"use client";
// بيانات المشروع مشتركة بين خطواته، وتُحدَّث تلقائيًا كل ثانيتين ونصف طالما توجد مهام جارية.
import { createContext, useContext, type ReactNode } from "react";
import type { BrandInput, DirectorOutput, ProjectSettings, TimelineData } from "@/lib/domain";
import { useData, type ApiError } from "@/lib/client";

export type Asset = { id: string; kind: "image" | "video" | "audio"; role: string; original_name: string; mime_type: string; size_bytes: string; width: number | null; height: number | null; duration_ms: number | null; analysis_status: string; analysis: { description?: string; tags?: string[]; suggested_use?: string } | null; is_simulated: boolean; url: string; created_at: string };
export type Scene = { id: string; position: number; title: string; duration_ms: number; visual_prompt: string; negative_prompt: string; camera: string; lighting: string; on_screen_text: string; voiceover: string; sfx: string; transition: string; editing_notes: string; continuity: string; reference_asset_ids: string[]; source_type: "generate" | "upload" | "none"; selected_asset_id: string | null; trim_start_ms: number; version: number };
export type Job = { id: string; type: string; status: "queued" | "processing" | "completed" | "failed" | "cancelled"; provider: string; progress: string | null; progress_label: string | null; error: string | null; is_simulated: boolean; cost_cents: number | null; cost_is_estimate: boolean; input: Record<string, unknown>; output: Record<string, unknown> | null; created_at: string; finished_at: string | null };
export type Audio = { id: string; scene_id: string | null; kind: string; text: string; asset_id: string | null; offset_ms: number; volume: string; status: "pending" | "ready" | "failed"; is_simulated: boolean; url: string | null; asset_duration_ms: number | null };
export type Export = { id: string; asset_id: string | null; created_at: string; is_simulated: boolean; aspect: string; width: number; height: number; duration_ms: number; url: string | null; download: string | null; settings_snapshot: { quality?: string } };
export type Bundle = {
  workspace: { id: string; name: string; role: "owner" | "editor" | "viewer" };
  project: { id: string; title: string; status: string; wizard_step: number; settings: ProjectSettings; version: number; brand_id: string };
  brand: BrandInput & { id: string; logo_asset_id: string | null };
  assets: Asset[];
  script: { id: string; version: number; source: string; provider: string | null; content: DirectorOutput; created_at: string } | null;
  scenes: Scene[];
  timeline: { version: number; data: TimelineData };
  audio: Audio[];
  jobs: Job[];
  exports: Export[];
};

type Ctx = { data: Bundle | undefined; error: ApiError | null; loading: boolean; reload: () => Promise<Bundle | undefined>; setData: (b: Bundle) => void; activeJobs: Job[] };
const C = createContext<Ctx | null>(null);

export function ProjectProvider({ id, children }: { id: string; children: ReactNode }) {
  const { data, error, loading, reload, setData } = useData<Bundle>(`/api/projects/${id}`, (d) => (d?.jobs.some((j) => j.status === "queued" || j.status === "processing") ? 2500 : null));
  const activeJobs = data?.jobs.filter((j) => j.status === "queued" || j.status === "processing") ?? [];
  return <C.Provider value={{ data, error, loading, reload: reload as Ctx["reload"], setData: setData as Ctx["setData"], activeJobs }}>{children}</C.Provider>;
}

export function useProject() {
  const c = useContext(C);
  if (!c) throw new Error("useProject outside ProjectProvider");
  return c;
}
