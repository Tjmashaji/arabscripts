import type { NextRequest } from "next/server";
import { json } from "@/server/http";
import { computeTrends } from "@/server/sync";
import { cronAuthorized } from "../auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return json({ error: "unauthorized" }, 401);
  return json({ run: await computeTrends() });
}
