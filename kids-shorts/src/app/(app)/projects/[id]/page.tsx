import { notFound } from "next/navigation";
import { Editor } from "@/components/editor";
import { requireUser } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { getProject } from "@/server/services/projects";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  try {
    getProject(user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  return <Editor id={id} />;
}
