// رفع الوسائط: بث مباشر إلى التخزين مع حد للحجم، تحديد النوع من المحتوى، قراءة الأبعاد والمدة،
// ثم ربط الملف بالمساحة والمشروع. الروابط المؤقتة موقعة بـ HMAC ولها مدة صلاحية.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Readable } from "node:stream";
import { withUser, type Tx } from "../db";
import { env } from "../env";
import { errors } from "../http/errors";
import { probe } from "../media/probe";
import { sniff } from "../media/sniff";
import { newKey, storage, TooLargeError } from "../media/storage";
import { assertCanEdit, getProject, type Workspace } from "./core";

export const ROLES = ["product", "place", "logo", "other", "voice", "music", "sfx"] as const;
export type UploadRole = (typeof ROLES)[number];

export type AssetRow = {
  id: string;
  project_id: string | null;
  kind: "image" | "video" | "audio";
  role: string;
  original_name: string;
  mime_type: string;
  size_bytes: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  analysis_status: string;
  analysis: Record<string, unknown> | null;
  is_simulated: boolean;
  license: Record<string, unknown>;
  storage_key: string;
  created_at: string;
};

export async function ingestUpload(args: {
  userId: string;
  ws: Workspace;
  projectId: string;
  role: UploadRole;
  name: string;
  body: Readable;
  license?: { source: string; commercial_use_confirmed: boolean };
}): Promise<AssetRow> {
  assertCanEdit(args.ws);
  // التحقق من ملكية المشروع قبل كتابة أي بايت على القرص
  await withUser(args.userId, (tx) => getProject(tx, args.projectId));
  const maxBytes = env().MAX_UPLOAD_MB * 1024 * 1024;
  const key = newKey(args.ws.id, args.projectId, "bin");
  const store = storage();
  let put;
  try {
    put = await store.put(key, args.body, maxBytes);
  } catch (e) {
    if (e instanceof TooLargeError) throw errors.invalid(`حجم الملف أكبر من الحد المسموح (${env().MAX_UPLOAD_MB} ميغابايت).`);
    throw e;
  }
  const kind = sniff(put.head);
  const cleanup = () => store.remove(key);
  if (!kind) {
    await cleanup();
    throw errors.invalid("نوع الملف غير مدعوم. المسموح: JPG وPNG وWEBP للصور، MP4 وMOV وWEBM للفيديو، MP3 وWAV وM4A للصوت.");
  }
  if (args.role === "logo" && kind.kind !== "image") {
    await cleanup();
    throw errors.invalid("الشعار يجب أن يكون صورة.");
  }
  if (["voice", "music", "sfx"].includes(args.role) && kind.kind !== "audio") {
    await cleanup();
    throw errors.invalid("هذا التصنيف يقبل ملفات الصوت فقط.");
  }
  let meta;
  try {
    meta = await probe(await store.localPath(key));
  } catch {
    await cleanup();
    throw errors.invalid("تعذّرت قراءة الملف. قد يكون تالفًا أو بترميز غير مدعوم.");
  }
  if (kind.kind === "video" && !meta.hasVideo) {
    await cleanup();
    throw errors.invalid("ملف الفيديو لا يحتوي على مسار صورة.");
  }
  // إعادة تسمية الملف بالامتداد الصحيح
  const finalKey = key.replace(/\.bin$/, `.${kind.ext}`);
  const { rename } = await import("node:fs/promises");
  await rename(await store.localPath(key), await store.localPath(finalKey));
  try {
    return await withUser(args.userId, async (tx) => {
      const row = await tx.one<AssetRow>(
        `INSERT INTO media_assets (workspace_id, project_id, kind, role, storage_key, original_name, mime_type, size_bytes, checksum_sha256, width, height, duration_ms, license, created_by, analysis_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'none') RETURNING *`,
        [args.ws.id, args.projectId, kind.kind, args.role, finalKey, args.name.slice(0, 200), kind.mime, put.size, put.sha256, meta.width ?? null, meta.height ?? null, meta.durationMs ?? null, args.license ?? { source: "user_upload" }, args.userId],
      );
      if (args.role === "logo") await tx.q("UPDATE brands SET logo_asset_id = $2 WHERE id = (SELECT brand_id FROM projects WHERE id = $1) AND logo_asset_id IS NULL", [args.projectId, row!.id]);
      return row!;
    });
  } catch (e) {
    await store.remove(finalKey);
    throw e;
  }
}

export function listAssets(tx: Tx, projectId: string) {
  return tx.q<AssetRow>("SELECT * FROM media_assets WHERE project_id = $1 AND deleted_at IS NULL AND role <> 'export' ORDER BY created_at DESC", [projectId]);
}

export async function getAsset(tx: Tx, id: string) {
  const a = await tx.one<AssetRow>("SELECT * FROM media_assets WHERE id = $1 AND deleted_at IS NULL", [id]);
  if (!a) throw errors.notFound("الملف");
  return a;
}

export async function deleteAsset(tx: Tx, ws: Workspace, projectId: string, id: string) {
  assertCanEdit(ws);
  const a = await tx.one<AssetRow>("SELECT * FROM media_assets WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL", [id, projectId]);
  if (!a) throw errors.notFound("الملف");
  const used = await tx.one<{ n: number }>("SELECT count(*)::int AS n FROM scenes WHERE selected_asset_id = $1 AND deleted_at IS NULL", [id]);
  // حذف منطقي فوري؛ الملف الفعلي يحذفه مسار التنظيف بعد مهلة الاحتفاظ (انظر scripts/cleanup.ts)
  await tx.q("UPDATE media_assets SET deleted_at = now() WHERE id = $1", [id]);
  await tx.q("UPDATE scenes SET selected_asset_id = NULL, source_type = 'none' WHERE selected_asset_id = $1", [id]);
  await tx.q("UPDATE brands SET logo_asset_id = NULL WHERE logo_asset_id = $1", [id]);
  return { detachedFromScenes: used?.n ?? 0 };
}

// ───── روابط مؤقتة موقعة ─────
const sign = (assetId: string, exp: number) => createHmac("sha256", env().FILE_SIGNING_SECRET).update(`${assetId}.${exp}`).digest("base64url");

export function signedUrl(assetId: string, ttlSeconds = 3600, absolute = false) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const path = `/api/files/${assetId}?exp=${exp}&sig=${sign(assetId, exp)}`;
  return absolute ? new URL(path, env().APP_URL).toString() : path;
}

export function verifySignature(assetId: string, exp: string | null, sig: string | null) {
  if (!exp || !sig) return false;
  const e = Number(exp);
  if (!Number.isInteger(e) || e < Date.now() / 1000) return false;
  const a = Buffer.from(sign(assetId, e)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
