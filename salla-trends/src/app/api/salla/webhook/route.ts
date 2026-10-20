import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { safeEqual, verifySallaSignature } from "@/server/crypto";
import { asWorker } from "@/server/db";
import { env } from "@/server/env";
import { json } from "@/server/http";
import { ingestEvent } from "@/server/ingest";
import { parseEnvelope } from "@/server/salla/parse";

// نقطة استقبال أحداث سلة. الترتيب مهم:
// 1) التحقق من التوقيع على الجسم الخام  2) حفظ الحدث (البصمة تمنع التكرار)  3) المعالجة في معاملة
// 4) إذا فشلت المعالجة نرد 500 فتعيد سلة الإرسال، ونعيد المعالجة لأن الحدث محفوظ بلا processed_at.
export const runtime = "nodejs";
const MAX_BODY = 1024 * 1024;

function authentic(req: NextRequest, raw: string, secret: string) {
  const strategy = (req.headers.get("x-salla-security-strategy") ?? "Signature").toLowerCase();
  if (strategy === "token") {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    return token.length > 0 && safeEqual(token, secret);
  }
  return verifySallaSignature(raw, req.headers.get("x-salla-signature"), secret);
}

export async function POST(req: NextRequest) {
  const secret = env().SALLA_WEBHOOK_SECRET;
  if (!secret) return json({ error: "webhook secret not configured" }, 503);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "payload too large" }, 413);
  if (!authentic(req, raw, secret)) return json({ error: "invalid signature" }, 401);

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const ev = parseEnvelope(payload);
  if (!ev) return json({ error: "not a salla event" }, 400);

  const sha = createHash("sha256").update(raw).digest("hex");
  const saved = await asWorker((tx) =>
    tx.one<{ id: string; processed_at: Date | null }>(
      `INSERT INTO webhook_events (body_sha256, event, salla_merchant_id, payload) VALUES ($1, $2, $3, $4)
       ON CONFLICT (body_sha256) DO UPDATE SET body_sha256 = EXCLUDED.body_sha256
       RETURNING id, processed_at`,
      [sha, ev.event, ev.merchant, payload],
    ),
  );
  if (saved!.processed_at) return json({ ok: true, duplicate: true });

  try {
    const result = await asWorker(async (tx) => {
      const r = await ingestEvent(tx, ev);
      await tx.q("UPDATE webhook_events SET processed_at = now(), error = $2 WHERE id = $1", [saved!.id, r.handled ? null : (r.note ?? null)]);
      return r;
    });
    return json({ ok: true, handled: result.handled });
  } catch (e) {
    console.error("[webhook] processing failed", ev.event, e);
    await asWorker((tx) => tx.q("UPDATE webhook_events SET error = $2 WHERE id = $1", [saved!.id, String((e as Error).message).slice(0, 500)]));
    return json({ error: "processing failed" }, 500);
  }
}
