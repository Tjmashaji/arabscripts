import { anonymous } from "@/server/db";
import { json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await anonymous((tx) => tx.q("SELECT 1"));
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 503);
  }
}
