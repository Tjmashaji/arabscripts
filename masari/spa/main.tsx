// نسخة ثابتة (SPA) من التطبيق للنشر على Vercel: التطبيق كله يعمل في المتصفح ويتصل بـ Supabase مباشرة.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../app/globals.css";
import Home from "../app/page";
import { ErrorBoundary } from "../app/error-boundary";

createRoot(document.getElementById("root")!).render(<StrictMode><ErrorBoundary><Home /></ErrorBoundary></StrictMode>);
