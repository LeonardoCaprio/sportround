import type { Metadata } from "next";

import { Brand } from "@/components/brand";
import { CreateSessionForm } from "@/components/create-session-form";

export const metadata: Metadata = { title: "Create session" };

export default function NewSessionPage() {
  // This Server Component is rendered per request, so the default follows the user's current day.
  // eslint-disable-next-line react-hooks/purity
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="site-shell">
      <header className="topbar"><div className="container topbar-inner"><Brand /><span className="mode-badge">NEW SESSION</span></div></header>
      <main className="container form-page">
        <div className="form-intro"><p className="eyebrow">Session setup</p><h1>Plan the next round.</h1><p>Set the schedule, courts, and player levels. SportRound handles the rotation.</p></div>
        <CreateSessionForm defaultDate={tomorrow} />
      </main>
    </div>
  );
}
