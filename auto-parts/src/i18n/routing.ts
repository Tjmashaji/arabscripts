import { defineRouting } from "next-intl/routing";
import { defaultLocale, locales } from "./locales";

// العربية بلا بادئة (/products)، والإنجليزية والصينية ببادئة (/en/products، /zh/products).
export const routing = defineRouting({ locales, defaultLocale, localePrefix: "as-needed" });
