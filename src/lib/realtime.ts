export const SESSION_UPDATED_EVENT = "session_updated";
export const SESSION_FALLBACK_POLL_MS = 30_000;

export function sessionRealtimeTopic(shareCode: string): string {
  return `session:${shareCode.trim().toUpperCase()}`;
}
