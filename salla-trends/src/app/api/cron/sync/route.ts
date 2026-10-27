import type { NextRequest } from "next/server";
import { json } from "@/server/http";
import { runDueJobs } from "@/server/sync";
import { cronAuthorized } from "../auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return json({ error: "unauthorized" }, 401);
  return json(await runDueJobs({ budgetMs: 45_000 }));
}
