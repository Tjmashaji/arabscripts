// منطق قائمة العمليات المحفوظة بدون إنترنت، بلا اعتماد على المتصفح أو Supabase (يُختبر في tests/queue-core.test.mjs).

export type NewItem = { kind: "rpc"; name: string; args: Record<string, unknown> } | { kind: "insert"; table: string; row: Record<string, unknown> };

// نقاط GPS كثيرة (كل 10 ثوانٍ) فنحتفظ بآخرها فقط؛ العمليات المهمة لا تُزاح أبدًا بسبب نقاط GPS.
export const MAX_GPS = 500;
export const MAX_CRITICAL = 400;

export const isGpsItem = (x: NewItem) => x.kind === "insert" && x.table === "vehicle_locations";

/** يقص الأقدم من كل نوع عند تجاوز حده، ويحافظ على ترتيب الباقي. */
export function trimQueue<T extends NewItem>(items: T[], maxGps = MAX_GPS, maxCritical = MAX_CRITICAL): T[] {
  const gps = items.filter(isGpsItem).length, critical = items.length - gps;
  let dropGps = Math.max(0, gps - maxGps), dropCritical = Math.max(0, critical - maxCritical);
  if (!dropGps && !dropCritical) return items;
  return items.filter((x) => {
    if (isGpsItem(x)) { if (dropGps > 0) { dropGps--; return false; } return true; }
    if (dropCritical > 0) { dropCritical--; return false; }
    return true;
  });
}
