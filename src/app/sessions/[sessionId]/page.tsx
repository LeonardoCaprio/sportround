import type { Metadata } from "next";

import { SessionApp } from "@/components/session-app";

export const metadata: Metadata = { title: "Host session" };

export default async function HostSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <SessionApp identifier={sessionId} mode="host" />;
}
