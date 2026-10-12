import type { Metadata } from "next";
import { getSessionUser } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { PageHeader } from "@/components/ui/misc";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "AI shopping assistant — bolo ya likho, list ready",
  description: `Tell ${site.name} what you need in Hinglish, Hindi or English and get a ready-to-order list matched to products in stock in ${site.city}.`,
  // A tool, not a landing page: crawlable, but kept out of the index.
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AssistantPage({ searchParams }: Props) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const mode = typeof sp.mode === "string" ? sp.mode : "";
  const wa = typeof sp.wa === "string" && /^[0-9a-f-]{36}$/i.test(sp.wa) ? sp.wa : null;
  const aiConfigured = Boolean(serverEnv().anthropicKey);
  return (
    <div className="px-4 pt-1 sm:px-0">
      <PageHeader title="AI shopping assistant" subtitle="“Family of 4 ke liye ek hafte ka saaman” · “2 kilo aata aur ek kilo chini” — Hinglish samajhta hai" className="px-0" />
      <AssistantChat signedIn={Boolean(user)} aiConfigured={aiConfigured} autoVoice={mode === "voice"} waId={wa} />
    </div>
  );
}
