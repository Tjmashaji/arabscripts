import { countryOptions } from "@/lib/partners";
import { Select } from "./ui";

// قائمة دول بأسمائها بلغة الصفحة؛ القيمة المرسلة رمز الدولة (CN، SA…).
export function CountrySelect({ name, id, locale, defaultValue, required, disabled, placeholder }: {
  name: string; id?: string; locale: string; defaultValue?: string | null; required?: boolean; disabled?: boolean; placeholder: string;
}) {
  return (
    <Select id={id ?? name} name={name} defaultValue={defaultValue ?? ""} required={required} disabled={disabled}>
      <option value="">{placeholder}</option>
      {countryOptions(locale).map((c) => (
        <option key={c.code} value={c.code}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}
