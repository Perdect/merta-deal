import type { Metadata } from "next";
import { getAuthUser } from "@/lib/supabase/server";
import { isClaudeConfigured } from "@/lib/ai/client";
import { AssistantChat } from "@/components/assistant/assistant-chat";
import { ShopPageHeader } from "@/components/shop/shop-page-header";
import { site } from "@/config/site";

export const metadata: Metadata = {
  title: "Shopping assistant — bolo ya likho, list ready",
  description: `Tell ${site.name} what you need in Hinglish, Hindi or English and get a list of real products from the shop in ${site.city}, with today's prices and stock, to review and add to your cart.`,
  // A tool, not a landing page: crawlable, but kept out of the index.
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AssistantPage({ searchParams }: Props) {
  const sp = await searchParams;
  // Only whether someone is signed in is needed here; nothing about the person is rendered or sent on.
  const user = await getAuthUser();
  const mode = typeof sp.mode === "string" ? sp.mode : "";
  const wa = typeof sp.wa === "string" && /^[0-9a-f-]{36}$/i.test(sp.wa) ? sp.wa : null;
  return (
    <div className="px-4 pt-1 sm:px-0">
      <ShopPageHeader title="Shopping assistant" cart subtitle="“Chai ka saaman” · “kheer banana hai” · “delivery charge kitna hai?” — Hinglish, Hindi ya English" className="px-0" />
      <AssistantChat signedIn={Boolean(user)} member={Boolean(user && !user.is_anonymous)} aiConfigured={isClaudeConfigured()} autoVoice={mode === "voice"} waId={wa} />
    </div>
  );
}
