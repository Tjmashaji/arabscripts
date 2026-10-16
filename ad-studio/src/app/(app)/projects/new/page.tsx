"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandForm, emptyBrand } from "@/components/brand-form";
import { Button, Card, Field, Input, Notice, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/client";

export default function NewProject() {
  const router = useRouter();
  const [brand, setBrand] = useState(emptyBrand);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ project: { id: string } }>("/api/projects", { body: { title: title || undefined, brand } });
      router.push(`/projects/${r.project.id}/media`);
    } catch (e) {
      setError(e as ApiError);
      setBusy(false);
    }
  }
  const errors = Array.isArray(error?.details) ? Object.fromEntries((error.details as { path: string; message: string }[]).map((d) => [d.path.replace("brand.", ""), d.message])) : {};
  return (
    <div className="max-w-3xl">
      <PageHeader eyebrow="الخطوة 1 من 6" title="مشروع إعلاني جديد" subtitle="ابدأ ببيانات نشاطك. يمكنك تعديلها في أي وقت لاحقًا." />
      <Card>
        <div className="flex flex-col gap-5">
          <Field label="اسم المشروع (اختياري)" htmlFor="title" hint="يظهر في لوحة مشاريعك فقط."><Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: إعلان افتتاح الفرع الجديد" maxLength={160} /></Field>
          <BrandForm value={brand} onChange={setBrand} errors={errors} />
          {error ? <Notice tone="danger">{error.message}</Notice> : null}
          <div className="flex justify-end"><Button onClick={create} loading={busy} disabled={!brand.name.trim()}>متابعة إلى رفع المواد</Button></div>
        </div>
      </Card>
    </div>
  );
}
