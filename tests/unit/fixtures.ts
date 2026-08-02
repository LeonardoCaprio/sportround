import type {
  AssignmentRecord,
  MatchRecord,
  PlayerLevel,
  PlayerRecord,
  RoundRecord,
  Team,
} from "@/lib/domain/types";

export function player(id: string, level: PlayerLevel = "intermediate"): PlayerRecord {
  return {
    id,
    sessionId: "session-1",
    name: id.replaceAll("-", " "),
    level,
    active: true,
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

function assignment(id: number, matchId: string, playerId: string, team: Team, slot: number): AssignmentRecord {
  return {
    id,
    matchId,
    playerId,
    team,
    slot,
    active: true,
    joinedAt: "2026-08-01T00:00:00.000Z",
    leftAt: null,
  };
}

export function completedRound(
  roundNumber: number,
  teamA: string[],
  teamB: string[],
  teamAScore = 21,
  teamBScore = 15,
): RoundRecord {
  const matchId = `match-${roundNumber}`;
  const assignments = [
    ...teamA.map((playerId, index) => assignment(index + 1, matchId, playerId, "a", index + 1)),
    ...teamB.map((playerId, index) => assignment(teamA.length + index + 1, matchId, playerId, "b", index + 1)),
  ];
  const match: MatchRecord = {
    id: matchId,
    sessionId: "session-1",
    roundId: `round-${roundNumber}`,
    courtNumber: 1,
    status: "completed",
    teamAScore,
    teamBScore,
    winner: teamAScore === 21 ? "a" : "b",
    startedAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-01T00:15:00.000Z",
    updatedAt: "2026-08-01T00:15:00.000Z",
    assignments,
    substitutions: [],
  };

  return {
    id: `round-${roundNumber}`,
    sessionId: "session-1",
    roundNumber,
    status: "completed",
    startedAt: match.startedAt,
    completedAt: match.completedAt,
    createdAt: "2026-08-01T00:00:00.000Z",
    matches: [match],
  };
}
