import { getTranslations } from "next-intl/server";
import { getPublicSettings } from "@/lib/site-data";
import { whatsappLink } from "@/lib/site";

// زر واتساب ثابت في أسفل كل صفحة عامة، يظهر فقط إذا أدخل المدير رقم الواتساب في الإعدادات.
export async function WhatsAppButton() {
  const s = await getPublicSettings();
  if (!s.contact_whatsapp) return null;
  const t = await getTranslations("footer");
  const href = `${whatsappLink(s.contact_whatsapp)}?text=${encodeURIComponent(t("whatsappMessage"))}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      aria-label={t("whatsappCta")}
      title={t("whatsappCta")}
      className="fixed end-4 z-40 flex size-14 items-center justify-center rounded-full bg-[#1f9d55] text-white shadow-lg ring-4 ring-white/70 transition hover:bg-[#178a49] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      {/* فقاعة محادثة بسماعة هاتف */}
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7" fill="currentColor">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z" />
        <path d="M16.5 14.3c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.6 2.6 0 0 0-.8 1.9 4.5 4.5 0 0 0 .9 2.4 10.3 10.3 0 0 0 4 3.5c1.5.6 2 .7 2.7.6a2.3 2.3 0 0 0 1.5-1.1 1.9 1.9 0 0 0 .1-1.1c0-.1-.2-.2-.4-.3Z" />
      </svg>
    </a>
  );
}
