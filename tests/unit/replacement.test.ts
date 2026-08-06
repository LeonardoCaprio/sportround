import { describe, expect, it } from "vitest";

import { fairReplacementPool, rankReplacementCandidates } from "@/lib/domain/replacement";
import type {
  MatchRecord,
  PlayerLevel,
  PlayerRecord,
  PlayerStanding,
  RoundRecord,
  Team,
} from "@/lib/domain/types";

function testPlayer(id: string, level: PlayerLevel): PlayerRecord {
  return {
    id,
    sessionId: "session-1",
    name: id,
    level,
    active: true,
    createdAt: "2026-08-04T09:00:00.000Z",
  };
}

function standing(player: PlayerRecord, gamesPlayed: number, lastPlayedRound: number | null): PlayerStanding {
  return {
    playerId: player.id,
    name: player.name,
    level: player.level,
    gamesPlayed,
    wins: 0,
    losses: gamesPlayed,
    leaderboardPoints: 0,
    winRate: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    pointDifference: 0,
    lastPlayedRound,
    currentCourt: null,
    nextCourt: null,
    status: "waiting",
  };
}

function assignment(id: number, playerId: string, team: Team, slot: number) {
  return {
    id,
    matchId: "match-1",
    playerId,
    team,
    slot,
    active: true,
    joinedAt: "2026-08-04T10:00:00.000Z",
    leftAt: null,
  };
}

describe("fair replacement suggestions", () => {
  it("prioritizes a waiting player who preserves the court level balance", () => {
    const outgoing = testPlayer("outgoing-beginner", "beginner");
    const teammate = testPlayer("teammate-intermediate", "intermediate");
    const opponentOne = testPlayer("opponent-beginner", "beginner");
    const opponentTwo = testPlayer("opponent-pro", "pro");
    const balancedCandidate = testPlayer("waiting-intermediate", "intermediate");
    const weakerCandidate = testPlayer("waiting-beginner", "beginner");
    const players = [outgoing, teammate, opponentOne, opponentTwo, balancedCandidate, weakerCandidate];
    const match: MatchRecord = {
      id: "match-1",
      sessionId: "session-1",
      roundId: "round-2",
      courtNumber: 1,
      status: "live",
      teamAScore: 0,
      teamBScore: 0,
      winner: null,
      startedAt: "2026-08-04T10:00:00.000Z",
      completedAt: null,
      updatedAt: "2026-08-04T10:00:00.000Z",
      assignments: [
        assignment(1, outgoing.id, "a", 1),
        assignment(2, teammate.id, "a", 2),
        assignment(3, opponentOne.id, "b", 1),
        assignment(4, opponentTwo.id, "b", 2),
      ],
      substitutions: [],
    };
    const round: RoundRecord = {
      id: "round-2",
      sessionId: "session-1",
      roundNumber: 2,
      status: "live",
      startedAt: match.startedAt,
      completedAt: null,
      createdAt: "2026-08-04T10:00:00.000Z",
      matches: [match],
    };
    const standings = players.map((player) =>
      standing(player, player.id === balancedCandidate.id ? 2 : 0, null),
    );

    const ranked = rankReplacementCandidates({
      match,
      round,
      outgoingAssignmentId: 1,
      players,
      standings,
    });

    expect(ranked[0]).toMatchObject({
      playerId: balancedCandidate.id,
      balanceGap: 0,
    });
    expect(fairReplacementPool(ranked).map((candidate) => candidate.playerId)).toContain(
      balancedCandidate.id,
    );
  });
});
