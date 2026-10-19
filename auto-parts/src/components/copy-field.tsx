"use client";

import { useState } from "react";

// حقل للقراءة مع زر نسخ. يعمل بدون JavaScript أيضًا (يمكن تحديد النص ونسخه يدويًا).
export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex flex-col gap-2 sm:flex-row">
      <input readOnly value={value} dir="ltr" onFocus={(e) => e.currentTarget.select()}
        className="min-h-11 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink" />
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true))}
        className="min-h-11 shrink-0 rounded-lg bg-ink px-4 text-sm font-bold text-white"
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}
