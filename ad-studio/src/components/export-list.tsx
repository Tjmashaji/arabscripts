"use client";
import { Download } from "lucide-react";
import type { Export } from "./project-context";
import { Badge, SimBadge } from "./ui";
import { fmtDate, fmtSec } from "@/lib/client";

export function ExportList({ items, quality }: { items: Export[]; quality: "final" | "preview" }) {
  const list = items.filter((e) => (e.settings_snapshot.quality ?? "final") === quality);
  if (!list.length) return null;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {list.map((e) => (
        <li key={e.id} className="rounded-2xl border border-line overflow-hidden bg-surface">
          {e.url ? <div className="bg-black grid place-items-center"><video src={`${e.url}#t=0.1`} controls playsInline preload="metadata" className="max-h-[60vh] w-auto max-w-full" style={{ aspectRatio: e.aspect.replace(":", " / ") }} /></div> : null}
          <div className="p-3 flex flex-wrap items-center gap-2 text-xs">
            <Badge>{e.aspect}</Badge>
            <span className="text-muted ltr">{e.width}×{e.height} · {fmtSec(e.duration_ms)}</span>
            {e.is_simulated ? <SimBadge /> : null}
            <span className="text-muted">{fmtDate(e.created_at)}</span>
            {e.download && quality === "final" ? (
              <a href={e.download} className="ms-auto inline-flex items-center gap-1 rounded-lg bg-ink px-3 h-8 font-bold text-white"><Download className="size-3.5" aria-hidden /> تنزيل</a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
