import type { ReactNode } from "react";
import "./globals.css";

// عنصر html يُبنى في [locale]/layout.tsx لأن lang وdir يعتمدان على اللغة.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
