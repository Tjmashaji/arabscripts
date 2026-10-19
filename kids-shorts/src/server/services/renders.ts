import { q } from "../db";

export type RenderRow = { id: string; project_id: string; file: string; thumb: string; duration_ms: number; size_bytes: number; project_version: number; created_at: number };

export function projectRenders(projectId: string) {
  return q.all<RenderRow>("SELECT * FROM renders WHERE project_id = ? ORDER BY created_at DESC LIMIT 10", projectId).map((r) => ({
    id: r.id, durationMs: r.duration_ms, sizeBytes: r.size_bytes, projectVersion: r.project_version, createdAt: r.created_at,
    video: `/api/files/${r.file}`, thumb: `/api/files/${r.thumb}`,
  }));
}

export function getRender(projectId: string, id: string) {
  return q.get<RenderRow>("SELECT * FROM renders WHERE id = ? AND project_id = ?", id, projectId);
}
