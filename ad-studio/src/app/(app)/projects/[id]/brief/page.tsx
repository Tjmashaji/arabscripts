"use client";
import { useState } from "react";
import { BrandForm } from "@/components/brand-form";
import { useProject } from "@/components/project-context";
import { Button, Card, LinkButton, Notice } from "@/components/ui";
import type { BrandInput } from "@/lib/domain";
import { api, ApiError } from "@/lib/client";

export default function Brief() {
  const { data } = useProject();
  if (!data) return null;
  const { name, business_type, description, audience, city, differentiator, offer, contact } = data.brand;
  return <BriefForm initial={{ name, business_type, description, audience, city, differentiator, offer, contact }} />;
}

function BriefForm({ initial }: { initial: BrandInput }) {
  const { data, reload } = useProject();
  const [brand, setBrand] = useState<BrandInput>(initial);
  const [state, setState] = useState<{ busy: boolean; ok?: boolean; error?: string }>({ busy: false });
  if (!data) return null;
  async function save() {
    setState({ busy: true });
    try {
      await api(`/api/projects/${data!.project.id}`, { method: "PATCH", body: { brand } });
      await reload();
      setState({ busy: false, ok: true });
    } catch (e) {
      setState({ busy: false, error: (e as ApiError).message });
    }
  }
  return (
    <div className="max-w-3xl">
      <Card>
        <h2 className="font-display text-lg mb-1">بيانات النشاط</h2>
        <p className="text-sm text-ink-2 mb-5">هذه البيانات هي المصدر الوحيد للمعلومات في الإعلان. لن نضيف أسعارًا أو عروضًا أو مزايا لم تكتبها.</p>
        <BrandForm value={brand} onChange={(b) => { setBrand(b); setState({ busy: false }); }} />
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {state.ok ? <span className="text-sm text-ok font-bold" role="status">حُفظت التعديلات</span> : null}
          {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
          <Button variant="secondary" onClick={save} loading={state.busy} disabled={!brand.name.trim() || data.workspace.role === "viewer"}>حفظ</Button>
          <LinkButton href={`/projects/${data.project.id}/media`}>التالي: المواد</LinkButton>
        </div>
      </Card>
    </div>
  );
}
