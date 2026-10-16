"use client";
import { FileAudio } from "lucide-react";
import type { Asset } from "./project-context";
import { cx, SimBadge } from "./ui";

// معاينة صغيرة لأي ملف: صورة، فيديو (بدون صوت عند المرور)، أو صوت
export function AssetThumb({ asset, className, controls }: { asset: Asset; className?: string; controls?: boolean }) {
  return (
    <div className={cx("relative overflow-hidden rounded-xl bg-surface-2", className)}>
      {asset.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.url} alt={asset.analysis?.description ?? asset.original_name} className="size-full object-cover" loading="lazy" />
      ) : asset.kind === "video" ? (
        <video src={`${asset.url}#t=0.1`} className="size-full object-cover" muted playsInline preload="metadata" controls={controls} onMouseEnter={(e) => !controls && void e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => !controls && e.currentTarget.pause()} />
      ) : (
        <div className="size-full grid place-items-center p-2 gap-1 text-muted">
          <FileAudio className="size-7" aria-hidden />
          {controls ? <audio src={asset.url} controls className="w-full" preload="none" /> : null}
        </div>
      )}
      {asset.is_simulated ? <SimBadge className="absolute top-2 start-2" /> : null}
    </div>
  );
}
