import "server-only";
import { NextResponse } from "next/server";
import { anonymous } from "./db";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function rateLimited(bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const row = await anonymous((tx) => tx.one<{ ok: boolean }>("SELECT app.hit_rate_limit($1, $2, $3) AS ok", [bucket, limit, windowSeconds]));
  return !row?.ok;
}

export async function clientIp(h: Headers) {
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}
