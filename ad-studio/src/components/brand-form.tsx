"use client";
import { useState } from "react";
import { BUSINESS_TYPES, type BrandInput } from "@/lib/domain";
import { ChoiceGroup, Field, Input, Textarea } from "./ui";

export const emptyBrand: BrandInput = { name: "", business_type: "restaurant_cafe", description: "", audience: "", city: "", differentiator: "", offer: "", contact: "" };

// نموذج بيانات النشاط (الخطوة الأولى). العرض والسعر اختياريان: لا يُذكران في الإعلان إن تُركا فارغين.
export function BrandForm({ value, onChange, errors = {} }: { value: BrandInput; onChange: (b: BrandInput) => void; errors?: Record<string, string> }) {
  const set = <K extends keyof BrandInput>(k: K) => (v: BrandInput[K]) => onChange({ ...value, [k]: v });
  const [showMore, setShowMore] = useState(Boolean(value.audience || value.city || value.differentiator || value.offer || value.contact));
  return (
    <div className="flex flex-col gap-5">
      <Field label="اسم النشاط التجاري" htmlFor="b-name" error={errors.name}>
        <Input id="b-name" value={value.name} onChange={(e) => set("name")(e.target.value)} placeholder="مثال: مطعم الجمر" maxLength={120} />
      </Field>
      <ChoiceGroup label="نوع النشاط" value={value.business_type} onChange={set("business_type")} options={BUSINESS_TYPES.list} />
      <Field label="وصف المنتج أو الخدمة" htmlFor="b-desc" hint="ماذا تقدّم؟ اكتب بلغتك، والمخرج الإبداعي يستخدم ما تكتبه فقط.">
        <Textarea id="b-desc" value={value.description} onChange={(e) => set("description")(e.target.value)} maxLength={2000} placeholder="مثال: مشويات على الفحم وأطباق شعبية" />
      </Field>
      {!showMore ? (
        <button type="button" onClick={() => setShowMore(true)} className="self-start text-sm font-bold text-accent">+ تفاصيل إضافية (الجمهور، المدينة، الميزة، العرض، التواصل)</button>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="الجمهور المستهدف" htmlFor="b-aud"><Input id="b-aud" value={value.audience} onChange={(e) => set("audience")(e.target.value)} maxLength={500} placeholder="العائلات، الشباب…" /></Field>
          <Field label="المدينة أو السوق" htmlFor="b-city"><Input id="b-city" value={value.city} onChange={(e) => set("city")(e.target.value)} maxLength={120} /></Field>
          <Field label="الميزة التنافسية" htmlFor="b-diff"><Input id="b-diff" value={value.differentiator} onChange={(e) => set("differentiator")(e.target.value)} maxLength={500} placeholder="ما الذي يميزك عن غيرك؟" /></Field>
          <Field label="العرض أو السعر" htmlFor="b-offer" hint="اختياري. إن تركته فارغًا لن يذكر الإعلان أي عرض أو سعر."><Input id="b-offer" value={value.offer} onChange={(e) => set("offer")(e.target.value)} maxLength={300} /></Field>
          <Field label="طريقة التواصل أو الطلب" htmlFor="b-contact" hint="حساب، رقم، تطبيق توصيل… كما تريده أن يظهر."><Input id="b-contact" value={value.contact} onChange={(e) => set("contact")(e.target.value)} maxLength={300} /></Field>
        </div>
      )}
    </div>
  );
}
