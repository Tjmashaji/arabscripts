import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { currentUser, type SessionUser } from "../auth/session";
import { anonymous } from "../db";
import { env } from "../env";
import { errors, toResponse } from "./errors";

type Ctx<P> = { params: Promise<P> };

// حماية CSRF: الطلبات المعدِّلة يجب أن تأتي من نفس الأصل
function checkOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(env().APP_URL).origin, req.nextUrl.origin]);
  if (!origin || !allowed.has(origin)) throw errors.forbidden();
}

export async function rateLimit(bucket: string, limit: number, windowSeconds: number) {
  const row = await anonymous((tx) => tx.one<{ ok: boolean }>("SELECT app.hit_rate_limit($1, $2, $3) AS ok", [bucket, limit, windowSeconds]));
  if (!row?.ok) throw errors.rateLimited();
}

export function handler<P = Record<string, string>>(
  fn: (args: { req: NextRequest; user: SessionUser; params: P }) => Promise<unknown>,
  opts: { auth?: boolean } = {},
) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      checkOrigin(req);
      const user = await currentUser();
      if (opts.auth !== false && !user) throw errors.unauthorized();
      const out = await fn({ req, user: user as SessionUser, params: await ctx.params });
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return toResponse(e);
    }
  };
}

export async function body<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw errors.invalid("صيغة الطلب غير صحيحة.");
  }
  return schema.parse(raw);
}
