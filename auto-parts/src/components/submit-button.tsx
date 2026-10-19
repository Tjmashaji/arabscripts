"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./ui";

// زر إرسال يتعطل أثناء المعالجة، حتى لا يُرسل النموذج مرتين (مثلًا طلب رابطين متتاليين من البريد).
export function SubmitButton(props: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props} />;
}
