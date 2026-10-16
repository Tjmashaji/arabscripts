// الأصوات المتاحة فعليًا لدى مزود الصوت المتصل (لا نعرض صوتًا غير مدعوم)
import { errors } from "@/server/http/errors";
import { handler } from "@/server/http/route";
import { speechProvider } from "@/server/providers/registry";
import { ProviderError } from "@/server/providers/types";

export const GET = handler(async () => {
  const p = speechProvider();
  if (!p) return { provider: null, voices: [], dialects: [] };
  try {
    return { provider: p.info, voices: await p.voices(), dialects: p.dialects };
  } catch (e) {
    if (e instanceof ProviderError) throw errors.unavailable(e.userMessage);
    throw e;
  }
});
