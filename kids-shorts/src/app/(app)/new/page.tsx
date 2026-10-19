import type { Metadata } from "next";
import { NewWizard } from "@/components/new-wizard";
import { PageHeader } from "@/components/ui";
import { services } from "@/server/env";

export const metadata: Metadata = { title: "مقطع جديد" };

export default function NewPage() {
  return (
    <>
      <PageHeader title="مقطع تعليمي جديد" subtitle="اختر المجال والموضوع والعمر. الدروس الجاهزة تُبنى فورًا وتستطيع تعديل كل شيء بعدها." />
      <NewWizard services={services()} />
    </>
  );
}
