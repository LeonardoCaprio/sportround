"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";

interface RecentSession {
  id: string;
  name: string;
  venue: string;
  scheduledStart: string;
}

export function RecentSessions() {
  const rawSessions = useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      return () => window.removeEventListener("storage", onStoreChange);
    },
    () => localStorage.getItem("sportround_recent") ?? "[]",
    () => "[]",
  );
  const sessions = useMemo<RecentSession[]>(() => {
    try {
      const parsed = JSON.parse(rawSessions) as unknown;
      return Array.isArray(parsed) ? parsed as RecentSession[] : [];
    } catch {
      return [];
    }
  }, [rawSessions]);

  if (sessions.length === 0) {
    return (
      <div className="empty-state">
        <CalendarClock aria-hidden />
        <div><strong>No sessions yet</strong><p>Create your first session and it will stay easy to find on this browser.</p></div>
        <Link className="button secondary compact" href="/sessions/new">Start now</Link>
      </div>
    );
  }

  return (
    <div className="recent-grid">
      {sessions.slice(0, 4).map((session) => (
        <Link className="recent-card" href={`/sessions/${session.id}`} key={session.id}>
          <span className="eyebrow">HOST SESSION</span>
          <strong>{session.name}</strong>
          <span>{session.venue}</span>
          <span>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.scheduledStart))}</span>
          <ArrowRight size={18} aria-hidden />
        </Link>
      ))}
    </div>
  );
}
