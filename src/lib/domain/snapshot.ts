import { calculateStandings } from "./standings";
import type { SessionAggregate, SessionSnapshot } from "./types";

export function toSnapshot(
  aggregate: SessionAggregate,
  permissions: SessionSnapshot["permissions"],
): SessionSnapshot {
  const { hostTokenHash: _hostTokenHash, ...safeSession } = aggregate.session;
  void _hostTokenHash;
  return {
    session: safeSession,
    players: aggregate.players,
    rounds: aggregate.rounds,
    standings: calculateStandings(aggregate.players, aggregate.rounds),
    permissions,
  };
}
