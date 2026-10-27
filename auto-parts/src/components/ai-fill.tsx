"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { aiFill } from "@/server/ai-actions";
import type { AiProfile } from "@/lib/ai-fill-profiles";
import { fillForm, selectOptions } from "@/lib/ai-fill-dom";
import { Alert, Button, Textarea } from "./ui";

export function AiFill({ profile, locale }: { profile: AiProfile; locale: string }) {
  const t = useTranslations("aiFill");
  const box = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ tone: "success" | "danger" | "info"; text: string; note?: string | null } | null>(null);

  function run() {
    const form = box.current?.closest("form");
    if (!form) return;
    const data = new FormData();
    data.set("profile", profile);
    data.set("locale", locale);
    data.set("text", textRef.current?.value ?? "");
    const file = fileRef.current?.files?.[0];
    if (file) data.set("file", file);
    data.set("options", JSON.stringify(selectOptions(form)));
    setResult(null);
    start(async () => {
      try {
        const res = await aiFill(data);
        if (!res.ok) { setResult({ tone: "danger", text: t(`errors.${res.error}`) }); return; }
        const n = fillForm(form, res.values);
        setResult(n > 0 ? { tone: "success", text: t("filled", { count: n }), note: res.note } : { tone: "info", text: t("nothing"), note: res.note });
      } catch {
        setResult({ tone: "danger", text: t("errors.failed") });
      }
    });
  }

  return (
    <div ref={box} className="sm:col-span-2">
      <details className="rounded-xl border border-accent/40 bg-accent-soft/40 p-4">
        <summary className="cursor-pointer font-bold">✨ {t("title")}</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-muted">{t(`help.${profile}`)}</p>
          <Textarea ref={textRef} aria-label={t("textLabel")} placeholder={t("placeholder")} maxLength={8000} rows={4} />
          <label className="flex flex-col gap-1 text-sm">
            <span>{t("fileLabel")}</span>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,application/pdf" className="text-sm" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" variant="secondary" onClick={run} disabled={pending} aria-busy={pending}>
              {pending ? t("working") : t("run")}
            </Button>
            <span className="text-xs text-muted">{t("privacy")}</span>
          </div>
          {result && (
            <Alert tone={result.tone}>
              {result.text}
              {result.note && <span className="mt-1 block text-sm">{result.note}</span>}
            </Alert>
          )}
        </div>
      </details>
    </div>
  );
}
