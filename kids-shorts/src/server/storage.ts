// تخزين الملفات محليًا داخل DATA_DIR. المسارات في قاعدة البيانات نسبية دائمًا، ويُرفض أي مسار يخرج من المجلد.
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./db";

export function abs(rel: string) {
  const root = path.join(dataDir(), "files");
  const p = path.resolve(root, rel);
  if (!p.startsWith(root + path.sep)) throw new Error("مسار ملف غير صالح");
  return p;
}

export async function put(rel: string, data: Buffer | Uint8Array) {
  const p = abs(rel);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data);
  return rel;
}

export async function ensureDir(rel: string) {
  const p = abs(rel);
  await mkdir(path.dirname(p), { recursive: true });
  return p;
}

export async function size(rel: string) {
  return (await stat(abs(rel))).size;
}

export async function remove(rel: string) {
  await rm(abs(rel), { force: true });
}

export async function removeProject(projectId: string) {
  await rm(abs(`projects/${projectId}/x`).replace(/[/\\]x$/, ""), { recursive: true, force: true });
}
