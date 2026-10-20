import type { Metadata } from "next";
import { ContentPage, contentMetadata } from "@/components/content-page";
import { localeFrom } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  return contentMetadata(await localeFrom(params), "terms");
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  return <ContentPage locale={await localeFrom(params)} pageKey="terms" />;
}
