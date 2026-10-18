// معاينة الصوت: رابط المعاينة الذي يوفّره المزود، أو عينة مولّدة من مزود مجاني أو المحاكاة. لا نستهلك رصيدًا مدفوعًا هنا.
import { z } from "zod";
import { NextResponse } from "next/server";
import { errors } from "@/server/http/errors";
import { body, handler, rateLimit } from "@/server/http/route";
import { speechProvider } from "@/server/providers/registry";

export const POST = handler(async ({ req, user }) => {
  const b = await body(req, z.object({ voice_id: z.string().max(120), text: z.string().max(200).default("هذا مثال قصير على الصوت.") }));
  await rateLimit(`voice-preview:${user.id}`, 60, 3600);
  const p = speechProvider();
  if (!p) throw errors.unavailable("خدمة الصوت غير متصلة.");
  if (p.info.mode === "live" && !p.info.free) {
    const v = (await p.voices()).find((x) => x.id === b.voice_id);
    if (!v?.previewUrl) throw errors.notFound("معاينة هذا الصوت");
    return { url: v.previewUrl, simulated: false };
  }
  // المحاكاة والصوت المجاني: نولّد العينة مباشرة لأنها بلا تكلفة
  const r = await p.synthesize({ text: b.text, voiceId: b.voice_id, speed: 1, tone: "calm" });
  return new NextResponse(new Uint8Array(r.audio), { headers: { "content-type": r.mime, ...(p.info.mode === "simulation" ? { "x-simulated": "1" } : {}) } });
});
