import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// بناء ثابت للنشر على Vercel (npm run build:spa). البناء الأصلي لـ Cloudflare يبقى كما هو.
const projectRoot = fileURLToPath(new URL("./", import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL("./spa", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  plugins: [react()],
  resolve: { alias: { "@": projectRoot } },
  build: { outDir: fileURLToPath(new URL("./dist-spa", import.meta.url)), emptyOutDir: true },
});
