import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { errors } from "@/server/http/errors";
import { handler, rateLimit } from "@/server/http/route";
import { inProject } from "@/server/http/scope";
import { enqueueJob } from "@/server/services/jobs";
import { ingestUpload, listAssets, ROLES, signedUrl, type UploadRole } from "@/server/services/media";
import { analysisProvider } from "@/server/providers/registry";

type P = { id: string };

export const GET = handler<P>(async ({ user, params }) =>
  inProject(user, params.id, async (tx) => ({ assets: (await listAssets(tx, params.id)).map((a) => ({ ...a, url: signedUrl(a.id) })) })),
);

// الرفع ببث جسم الطلب مباشرة إلى التخزين (بلا تحميل كامل في الذاكرة)، والمعاملات في الرابط
export const POST = handler<P>(async ({ req, user, params }) => {
  const role = req.nextUrl.searchParams.get("role") ?? "other";
  const name = (req.nextUrl.searchParams.get("name") ?? "file").slice(0, 200);
  if (!ROLES.includes(role as UploadRole)) throw errors.invalid("تصنيف الملف غير صالح.");
  if (!req.body) throw errors.invalid("الملف فارغ.");
  let license: { source: string; commercial_use_confirmed: boolean } | undefined;
  if (role === "music" || role === "sfx") {
    // لا نفترض أن أي ملف موسيقي مسموح تجاريًا: نطلب المصدر وإقرار الترخيص
    const source = req.nextUrl.searchParams.get("license_source")?.trim();
    if (!source || req.nextUrl.searchParams.get("commercial_ok") !== "1") throw errors.invalid("حدّد مصدر الموسيقى وأكّد أن ترخيصها يسمح بالاستخدام التجاري.");
    license = { source: source.slice(0, 300), commercial_use_confirmed: true };
  }
  await rateLimit(`upload:${user.id}`, 120, 3600);
  const ws = await inProject(user, params.id, async (_tx, w) => w);
  const asset = await ingestUpload({ userId: user.id, ws, projectId: params.id, role: role as UploadRole, name, body: Readable.fromWeb(req.body as unknown as WebReadableStream), license });
  // التحليل المرئي يُطلب تلقائيًا فقط إذا كانت الخدمة متصلة فعلًا
  let analysis: "queued" | "unavailable" = "unavailable";
  if (asset.kind !== "audio" && analysisProvider()) {
    await inProject(user, params.id, async (tx, w) => {
      await enqueueJob(tx, { ws: w, userId: user.id, projectId: params.id, type: "analyze_media", input: { asset_id: asset.id }, idempotencyKey: `analyze:${asset.id}`, estimatedCents: 2 });
      await tx.q("UPDATE media_assets SET analysis_status = 'pending' WHERE id = $1", [asset.id]);
    });
    analysis = "queued";
  } else {
    await inProject(user, params.id, (tx) => tx.q("UPDATE media_assets SET analysis_status = 'unavailable' WHERE id = $1", [asset.id]));
  }
  return { asset: { ...asset, url: signedUrl(asset.id), analysis_status: analysis === "queued" ? "pending" : "unavailable" } };
});
