import type { SessionRecord } from "./types";

export type SharedSessionUnavailableReason = "ended" | "expired";

export type SharedSessionAccess =
  | { available: true; expiresAt: string }
  | { available: false; expiresAt: string; reason: SharedSessionUnavailableReason };

export function sharedSessionExpiresAt(
  session: Pick<SessionRecord, "scheduledStart" | "durationMinutes">,
): string {
  return new Date(
    new Date(session.scheduledStart).getTime() + session.durationMinutes * 60_000,
  ).toISOString();
}

export function evaluateSharedSessionAccess(
  session: Pick<SessionRecord, "scheduledStart" | "durationMinutes" | "status">,
  now = Date.now(),
): SharedSessionAccess {
  const expiresAt = sharedSessionExpiresAt(session);

  if (session.status === "ended") {
    return { available: false, expiresAt, reason: "ended" };
  }

  if (now >= new Date(expiresAt).getTime()) {
    return { available: false, expiresAt, reason: "expired" };
  }

  return { available: true, expiresAt };
}
