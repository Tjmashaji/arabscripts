import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { SettingsView } from "@/components/settings-view";
import { requireUser } from "@/server/auth/session";
import { env, services } from "@/server/env";
import { getChannel } from "@/server/services/youtube";

export const metadata: Metadata = { title: "القناة والإعدادات" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUser();
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="القناة والإعدادات" subtitle="ربط قناة يوتيوب، وحالة الخدمات المتصلة بالخادم." />
      <SettingsView
        channel={getChannel(user.id)}
        services={services()}
        redirectUri={new URL("/api/youtube/callback", env().APP_URL).toString()}
        status={typeof sp.youtube === "string" ? sp.youtube : null}
      />
    </>
  );
}
