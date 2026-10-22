import { num, pct, sar } from "@/lib/format";
import { taxonomyName } from "@/lib/taxonomy";
import type { TrendItem } from "@/server/queries";
import { Badge, cx } from "./ui";

function Movement({ rank, prev }: { rank: number; prev: number | null }) {
  if (prev === null) return <span className="text-xs font-bold text-hot">جديد</span>;
  const d = prev - rank;
  if (d === 0) return <span className="text-xs text-muted">—</span>;
  return <span className={cx("text-xs font-bold num", d > 0 ? "text-ok" : "text-danger")}>{d > 0 ? `▲ ${d}` : `▼ ${-d}`}</span>;
}

// movement=false حين لا تقابل الصفوف لقطة سابقة (قائمة الفرص مرتبة من جديد)
export function TrendTable({ items, kind, compact, movement = true }: { items: TrendItem[]; kind: "best" | "trending"; compact?: boolean; movement?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[15px]">
        <thead>
          <tr className="text-right text-xs text-muted">
            <th className="px-1 pb-2 font-normal w-10">#</th>
            <th className="px-1 pb-2 font-normal">المنتج</th>
            {!compact ? <th className="px-1 pb-2 font-normal hidden md:table-cell">التصنيف</th> : null}
            <th className="px-1 pb-2 font-normal">{kind === "trending" ? "النمو" : "الوحدات"}</th>
            {!compact ? <th className="px-1 pb-2 font-normal hidden sm:table-cell">المتاجر</th> : null}
            {!compact ? <th className="px-1 pb-2 font-normal hidden sm:table-cell">السعر الوسيط</th> : null}
            {!compact && movement ? <th className="px-1 pb-2 font-normal">الحركة</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((it) => {
            const g = pct(it.growth);
            return (
              <tr key={it.fingerprint} className="align-middle">
                <td className="px-1 py-2.5 text-muted num">{it.rank}</td>
                <td className="px-1 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="line-clamp-1">{it.display_name}</span>
                    {it.mine ? <Badge tone="brand">في متجرك</Badge> : null}
                  </div>
                  <div className={cx("text-xs text-muted", !compact && "sm:hidden")}>{num(it.units)} وحدة · {num(it.stores_count)} متاجر</div>
                </td>
                {!compact ? <td className="px-1 py-2.5 text-ink-2 text-sm hidden md:table-cell">{it.taxonomy_hint ? taxonomyName(it.taxonomy_hint) : "—"}</td> : null}
                <td className="px-1 py-2.5 num">
                  {kind === "trending" ? (
                    g ? <span className="font-bold text-hot">{g}</span> : <Badge tone="hot">ناشئ</Badge>
                  ) : (
                    <span className="font-bold">{num(it.units)}</span>
                  )}
                </td>
                {!compact ? <td className="px-1 py-2.5 num hidden sm:table-cell">{num(it.stores_count)}</td> : null}
                {!compact ? <td className="px-1 py-2.5 num text-ink-2 hidden sm:table-cell">{sar(it.median_price_halalas)}</td> : null}
                {!compact && movement ? <td className="px-1 py-2.5"><Movement rank={it.rank} prev={it.prev_rank} /></td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
