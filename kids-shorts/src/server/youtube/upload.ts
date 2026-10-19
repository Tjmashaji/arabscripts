// رفع الفيديو إلى يوتيوب بالبروتوكول القابل للاستئناف (resumable upload) من YouTube Data API v3.
// المحتوى موجّه للأطفال دائمًا: selfDeclaredMadeForKids = true (متطلب قانون COPPA وسياسات يوتيوب).
import { open, stat } from "node:fs/promises";
import { ProviderError } from "../providers/types";

const UPLOAD_URL = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
// حجم القطعة يجب أن يكون من مضاعفات 256 كيلوبايت
export const CHUNK = 8 * 256 * 1024 * 4;

export type VideoMeta = {
  title: string;
  description: string;
  tags: string[];
  privacy: "private" | "unlisted" | "public";
  publishAt: string | null;
  syntheticMedia: boolean;
};

export function videoResource(m: VideoMeta) {
  return {
    snippet: { title: m.title, description: m.description, tags: m.tags, categoryId: "27", defaultLanguage: "ar", defaultAudioLanguage: "ar" },
    status: {
      // النشر المجدول يتطلب أن يبقى الفيديو خاصًا حتى موعده
      privacyStatus: m.publishAt ? "private" : m.privacy,
      ...(m.publishAt ? { publishAt: m.publishAt } : {}),
      selfDeclaredMadeForKids: true,
      containsSyntheticMedia: m.syntheticMedia,
      embeddable: true,
      license: "youtube",
    },
  };
}

async function apiError(res: Response): Promise<never> {
  const j = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[]; message?: string } };
  const reason = j.error?.errors?.[0]?.reason ?? "";
  const msg = `${res.status} ${reason} ${j.error?.message ?? ""}`;
  if (res.status === 401) throw new ProviderError(msg, false, "انتهت صلاحية ربط يوتيوب. أعد ربط القناة من الإعدادات.");
  if (reason === "quotaExceeded" || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") throw new ProviderError(msg, true, "تجاوزت الحصة اليومية لواجهة يوتيوب. ستُعاد المحاولة لاحقًا.");
  if (reason === "uploadLimitExceeded") throw new ProviderError(msg, false, "بلغت القناة الحد الأقصى للرفع اليوم. حاول غدًا.");
  if (reason === "invalidTitle" || reason === "invalidDescription" || reason === "invalidTags") throw new ProviderError(msg, false, "رفض يوتيوب العنوان أو الوصف أو الوسوم. عدّلها وحاول مجددًا.");
  if (reason === "invalidPublishAt") throw new ProviderError(msg, false, "موعد النشر المجدول غير صالح (يجب أن يكون في المستقبل).");
  if (reason === "forbidden" || res.status === 403) throw new ProviderError(msg, false, "ليست لدى الحساب صلاحية الرفع على هذه القناة.");
  throw new ProviderError(msg, res.status >= 500, "حدث خطأ لدى يوتيوب أثناء الرفع.");
}

// يبدأ جلسة رفع ويعيد رابطها (يُحفظ ليُستأنف منه إن توقف العامل)
export async function startSession(token: string, file: string, meta: VideoMeta) {
  const { size } = await stat(file);
  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8", "x-upload-content-length": String(size), "x-upload-content-type": "video/mp4" },
    body: JSON.stringify(videoResource(meta)),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) await apiError(res);
  const loc = res.headers.get("location");
  if (!loc) throw new ProviderError("no location", true, "لم يُعد يوتيوب رابط جلسة الرفع. ستُعاد المحاولة.");
  return loc;
}

// يسأل الخادم عن عدد البايتات المستلمة في جلسة سابقة (null = اكتمل وأعاد الفيديو)
async function received(token: string, sessionUrl: string, size: number): Promise<{ offset: number } | { videoId: string } | "expired"> {
  const res = await fetch(sessionUrl, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-range": `bytes */${size}`, "content-length": "0" }, signal: AbortSignal.timeout(60_000) });
  if (res.status === 308) {
    const range = res.headers.get("range");
    return { offset: range ? Number(range.split("-")[1]) + 1 : 0 };
  }
  if (res.ok) return { videoId: ((await res.json()) as { id: string }).id };
  if (res.status === 404 || res.status === 410) return "expired";
  return apiError(res);
}

export async function uploadFile(
  token: string,
  sessionUrl: string,
  file: string,
  onProgress: (fraction: number) => void,
  isCancelled: () => boolean,
): Promise<string | "expired"> {
  const { size } = await stat(file);
  const state = await received(token, sessionUrl, size);
  if (state === "expired") return state;
  if ("videoId" in state) return state.videoId;
  let offset = state.offset;
  const fh = await open(file, "r");
  try {
    while (offset < size) {
      if (isCancelled()) throw new ProviderError("cancelled", false, "أُلغي الرفع.");
      const len = Math.min(CHUNK, size - offset);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, offset);
      let res: Response;
      try {
        res = await fetch(sessionUrl, {
          method: "PUT",
          headers: { authorization: `Bearer ${token}`, "content-length": String(len), "content-range": `bytes ${offset}-${offset + len - 1}/${size}`, "content-type": "video/mp4" },
          body: buf,
          signal: AbortSignal.timeout(5 * 60_000),
        });
      } catch (e) {
        throw new ProviderError(String(e), true, "انقطع الاتصال أثناء الرفع. سيُستأنف من حيث توقف.");
      }
      if (res.status === 308) {
        const range = res.headers.get("range");
        offset = range ? Number(range.split("-")[1]) + 1 : 0;
        onProgress(offset / size);
        continue;
      }
      if (res.ok) return ((await res.json()) as { id: string }).id;
      if (res.status >= 500) throw new ProviderError(`chunk ${res.status}`, true, "خطأ مؤقت لدى يوتيوب. سيُستأنف الرفع.");
      await apiError(res);
    }
    // وصلنا للنهاية دون رد نهائي: نسأل الخادم مرة أخيرة
    const last = await received(token, sessionUrl, size);
    if (last !== "expired" && "videoId" in last) return last.videoId;
    throw new ProviderError("incomplete", true, "لم يؤكد يوتيوب اكتمال الرفع. ستُعاد المحاولة.");
  } finally {
    await fh.close();
  }
}
