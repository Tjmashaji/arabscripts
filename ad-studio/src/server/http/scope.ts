import { withUser, type Tx } from "../db";
import type { SessionUser } from "../auth/session";
import { currentWorkspace, workspaceOfProject, type Workspace } from "../services/core";

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// معاملة باسم المستخدم مع مساحته الافتراضية
export function inWorkspace<T>(user: SessionUser, fn: (tx: Tx, ws: Workspace) => Promise<T>) {
  return withUser(user.id, async (tx) => fn(tx, await currentWorkspace(tx, user.id)));
}

// معاملة باسم المستخدم مع مساحة المشروع المطلوب (404 إذا لم يكن عضوًا فيها)
export function inProject<T>(user: SessionUser, projectId: string, fn: (tx: Tx, ws: Workspace) => Promise<T>) {
  return withUser(user.id, async (tx) => {
    if (!isUuid(projectId)) throw (await import("./errors")).errors.notFound("المشروع");
    return fn(tx, await workspaceOfProject(tx, user.id, projectId));
  });
}
