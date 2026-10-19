// كل ما تحتاجه صفحة المحرر في طلب واحد
import { services } from "../env";
import { projectJobs } from "./jobs";
import { getProject, renderIssues } from "./projects";
import { projectRenders } from "./renders";
import { getChannel, projectUploads } from "./youtube";

export function projectPayload(userId: string, id: string) {
  const project = getProject(userId, id);
  return {
    project: { ...project, scenes: project.scenes.map((s) => ({ ...s, audio: s.audio ? { durationMs: s.audio.durationMs, source: s.audio.source, text: s.audio.text, url: `/api/files/${s.audio.file}` } : null })) },
    issues: renderIssues(project),
    jobs: projectJobs(userId, id),
    renders: projectRenders(id),
    uploads: projectUploads(id),
    channel: getChannel(userId),
    services: services(),
  };
}

export type ProjectPayload = ReturnType<typeof projectPayload>;
