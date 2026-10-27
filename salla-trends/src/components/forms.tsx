"use client";
// النماذج التفاعلية: حالة الإرسال والأخطاء عبر useActionState، والإجراءات نفسها في الخادم (server/actions.ts).
import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { VERIFICATION_KINDS, type VerificationKind } from "@/lib/verification";
import { adminLogin, deleteMyData, reviewVerification, submitVerification, type FormState } from "@/server/actions";
import { buttonCls, cx, type ButtonVariant } from "./ui";

const inputCls = "w-full h-11 rounded-xl border border-line bg-surface px-3.5 text-[15px] outline-none focus:border-ink-2";

export function Submit({ children, variant = "primary", className }: { children: ReactNode; variant?: ButtonVariant; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonCls(variant, className)}>
      {pending ? "جارٍ الإرسال…" : children}
    </button>
  );
}

function Result({ state }: { state: FormState }) {
  if (state?.error) return <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>;
  if (state?.message) return <p role="status" className="rounded-xl bg-ok-soft px-3 py-2 text-sm text-ok">{state.message}</p>;
  return null;
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-bold">{label}</label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function VerificationForm() {
  const [state, action] = useActionState(submitVerification, undefined);
  const [kind, setKind] = useState<VerificationKind>("commercial_register");
  if (state?.ok) return <Result state={state} />;
  return (
    <form action={action} className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="text-sm font-bold mb-1">نوع الوثيقة</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(VERIFICATION_KINDS) as VerificationKind[]).map((k) => (
            <label key={k} className={cx("flex items-center gap-2 rounded-xl border px-3 h-11 cursor-pointer", kind === k ? "border-brand bg-brand-soft" : "border-line bg-surface")}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="accent-[var(--brand)]" />
              <span className="text-[15px]">{VERIFICATION_KINDS[k].name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="رقم الوثيقة" hint={VERIFICATION_KINDS[kind].hint} htmlFor="v-number">
        <input id="v-number" name="number" defaultValue={state?.values?.number} required inputMode={kind === "freelance" ? "text" : "numeric"} dir="ltr" className={cx(inputCls, "text-left")} />
      </Field>
      <Field label="الاسم كما في الوثيقة" htmlFor="v-name">
        <input id="v-name" name="legal_name" defaultValue={state?.values?.legal_name} required minLength={2} maxLength={200} className={inputCls} />
      </Field>
      <Field label="صورة الوثيقة" hint="PDF أو PNG أو JPG، حتى 4 ميجابايت. لا يطّلع عليها إلا فريق المراجعة." htmlFor="v-doc">
        <input id="v-doc" name="document" type="file" required accept="application/pdf,image/png,image/jpeg" className="text-sm file:me-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:font-bold" />
      </Field>
      <Result state={state} />
      <div>
        <Submit>إرسال للمراجعة</Submit>
      </div>
    </form>
  );
}

export function DeleteDataForm() {
  const [state, action] = useActionState(deleteMyData, undefined);
  return (
    <form action={action} className="grid gap-3 max-w-md">
      <Field label="اكتب «حذف» للتأكيد" htmlFor="del-confirm">
        <input id="del-confirm" name="confirm" autoComplete="off" className={inputCls} />
      </Field>
      <Result state={state} />
      <div>
        <Submit variant="danger">حذف بيانات متجري</Submit>
      </div>
    </form>
  );
}

export function AdminLoginForm() {
  const [state, action] = useActionState(adminLogin, undefined);
  return (
    <form action={action} className="grid gap-4">
      <Field label="البريد" htmlFor="a-email">
        <input id="a-email" name="email" type="email" defaultValue={state?.values?.email} required autoComplete="username" dir="ltr" className={cx(inputCls, "text-left")} />
      </Field>
      <Field label="كلمة المرور" htmlFor="a-pass">
        <input id="a-pass" name="password" type="password" required autoComplete="current-password" dir="ltr" className={cx(inputCls, "text-left")} />
      </Field>
      <Result state={state} />
      <Submit className="w-full">دخول</Submit>
    </form>
  );
}

export function ReviewForm({ id }: { id: string }) {
  const [state, action] = useActionState(reviewVerification, undefined);
  if (state?.ok) return <p className="text-sm text-ok font-bold">تم حفظ القرار.</p>;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`note-${id}`} className="sr-only">ملاحظة للتاجر</label>
      <input id={`note-${id}`} name="note" placeholder="ملاحظة (مطلوبة عند الرفض)" className={inputCls} />
      <Result state={state} />
      <div className="flex gap-2">
        <button name="decision" value="approve" className={buttonCls("primary")}>اعتماد</button>
        <button name="decision" value="reject" className={buttonCls("danger")}>رفض</button>
      </div>
    </form>
  );
}
