import type { Metadata } from "next";

import { SessionApp } from "@/components/session-app";

export const metadata: Metadata = { title: "Shared live session" };

export default async function SharedSessionPage({ params }: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await params;
  return <SessionApp identifier={shareCode} mode="shared" />;
}
