// مساعد التعبئة في المتصفح: قراءة خيارات القوائم من النموذج، ووضع القيم المقترحة في الحقول.
type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const MARK = "2px solid var(--color-accent, #c2410c)";

// خيارات القوائم الظاهرة في النموذج نفسه، ليختار المساعد منها فقط.
export function selectOptions(form: HTMLFormElement) {
  const out: Record<string, { value: string; label: string }[]> = {};
  for (const el of Array.from(form.querySelectorAll("select[name]")) as HTMLSelectElement[]) {
    out[el.name] = Array.from(el.options).filter((o) => o.value).map((o) => ({ value: o.value, label: o.text }));
  }
  return out;
}

// يضع القيم المقترحة في حقول النموذج (لا يحفظ شيئًا) ويظلل ما تغيّر ليراجعه المستخدم.
export function fillForm(form: HTMLFormElement, values: Record<string, string>): number {
  let n = 0;
  for (const [name, value] of Object.entries(values)) {
    const item = form.elements.namedItem(name);
    if (!item) continue;
    if (item instanceof RadioNodeList) {
      const radio = (Array.from(item) as HTMLInputElement[]).find((r) => r.type === "radio" && r.value === value && !r.disabled);
      if (radio && !radio.checked) { radio.checked = true; radio.dispatchEvent(new Event("change", { bubbles: true })); n++; }
      continue;
    }
    const el = item as Field;
    if (el.disabled || (el instanceof HTMLInputElement && ["hidden", "file", "checkbox", "radio"].includes(el.type))) continue;
    if (el instanceof HTMLSelectElement && !Array.from(el.options).some((o) => o.value === value)) continue;
    const max = "maxLength" in el && el.maxLength > 0 ? el.maxLength : undefined;
    const next = max ? value.slice(0, max) : value;
    if (el.value === next) continue;
    el.value = next;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.style.outline = MARK;
    el.addEventListener("input", () => { el.style.outline = ""; }, { once: true });
    n++;
  }
  return n;
}
