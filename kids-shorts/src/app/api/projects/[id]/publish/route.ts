import { z } from "zod";
import { youtubeMetaSchema } from "@/lib/domain";
import { body, handler, rateLimit } from "@/server/http/route";
import { requestPublish } from "@/server/services/publish";

const input = z.object({
  renderId: z.string().uuid(),
  youtube: youtubeMetaSchema,
  privacy: z.enum(["private", "unlisted", "public"]),
  // موعد النشر بتوقيت ISO (اختياري)
  publishAt: z.string().datetime({ offset: true }).nullable(),
  // تأكيد صريح من صاحب القناة بأن المقطع موجّه للأطفال ويلتزم بسياسات يوتيوب
  confirmKids: z.literal(true, { error: "يجب تأكيد أن المحتوى موجّه للأطفال ومناسب لهم." }),
});

export const POST = handler<{ id: string }>(async ({ req, user, params }) => {
  rateLimit(`publish:${user.id}`, 20, 86400);
  const b = await body(req, input);
  return { job: requestPublish(user.id, params.id, b) };
});
