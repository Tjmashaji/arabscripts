"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { Button, Card, Field, Input, Notice } from "./ui";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await api(`/api/auth/${mode}`, { body: Object.fromEntries(f.entries()) });
      router.replace(mode === "signup" ? "/new" : "/dashboard");
      router.refresh();
    } catch (err) {
      const a = err as ApiError;
      setError(a.message);
      if (Array.isArray(a.details)) setFieldErrors(Object.fromEntries((a.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h1 className="font-display text-2xl mb-1">{mode === "login" ? "تسجيل الدخول" : "إنشاء حساب"}</h1>
      <p className="text-ink-2 text-sm mb-6">{mode === "login" ? "أكمل مقاطعك التعليمية من حيث توقفت." : "أنشئ مقاطع تعليمية قصيرة للأطفال وانشرها على يوتيوب."}</p>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {mode === "signup" ? (
          <Field label="الاسم" htmlFor="name" error={fieldErrors.name}>
            <Input id="name" name="name" autoComplete="name" required />
          </Field>
        ) : null}
        <Field label="البريد الإلكتروني" htmlFor="email" error={fieldErrors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required className="ltr text-end" />
        </Field>
        <Field label="كلمة المرور" htmlFor="password" hint={mode === "signup" ? "10 أحرف على الأقل" : undefined} error={fieldErrors.password}>
          <Input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required className="ltr text-end" />
        </Field>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button type="submit" loading={busy} className="mt-2">{mode === "login" ? "دخول" : "إنشاء الحساب"}</Button>
      </form>
      <p className="text-sm text-ink-2 mt-5 text-center">
        {mode === "login" ? (
          <>ليس لديك حساب؟ <Link className="font-bold text-accent" href="/signup">أنشئ حسابًا</Link></>
        ) : (
          <>لديك حساب؟ <Link className="font-bold text-accent" href="/login">سجّل الدخول</Link></>
        )}
      </p>
    </Card>
  );
}
