import type {
  AssignmentRecord,
  MatchRecord,
  PlayerRecord,
  PlayerStanding,
  RoundRecord,
  Team,
} from "./types";
import { LEVEL_SCORES } from "./types";

export interface ReplacementCandidate {
  playerId: string;
  balanceGap: number;
  gamesPlayed: number;
  levelDifference: number;
  consecutiveRoundPenalty: boolean;
  fairnessScore: number;
}

function activeAssignments(match: MatchRecord, team?: Team): AssignmentRecord[] {
  return match.assignments.filter(
    (assignment) => assignment.active && (team === undefined || assignment.team === team),
  );
}

function teamStrength(
  match: MatchRecord,
  team: Team,
  playerMap: Map<string, PlayerRecord>,
  outgoingAssignmentId: number,
  candidate?: PlayerRecord,
): number {
  const existing = activeAssignments(match, team).reduce((total, assignment) => {
    if (assignment.id === outgoingAssignmentId) return total;
    const player = playerMap.get(assignment.playerId);
    return total + (player ? LEVEL_SCORES[player.level] : 0);
  }, 0);

  return existing + (candidate ? LEVEL_SCORES[candidate.level] : 0);
}

export function rankReplacementCandidates({
  match,
  round,
  outgoingAssignmentId,
  players,
  standings,
}: {
  match: MatchRecord;
  round: RoundRecord;
  outgoingAssignmentId: number;
  players: PlayerRecord[];
  standings: PlayerStanding[];
}): ReplacementCandidate[] {
  const outgoing = activeAssignments(match).find(
    (assignment) => assignment.id === outgoingAssignmentId,
  );
  if (!outgoing) return [];

  const playerMap = new Map(players.map((player) => [player.id, player]));
  const standingMap = new Map(standings.map((standing) => [standing.playerId, standing]));
  const outgoingPlayer = playerMap.get(outgoing.playerId);
  if (!outgoingPlayer) return [];

  const assignedIds = new Set(
    round.matches.flatMap((candidateMatch) =>
      activeAssignments(candidateMatch).map((assignment) => assignment.playerId),
    ),
  );
  const opponent: Team = outgoing.team === "a" ? "b" : "a";
  const opponentStrength = teamStrength(
    match,
    opponent,
    playerMap,
    outgoingAssignmentId,
  );

  return players
    .filter((player) => player.active && !assignedIds.has(player.id))
    .map((player) => {
      const standing = standingMap.get(player.id);
      const balanceGap = Math.abs(
        teamStrength(match, outgoing.team, playerMap, outgoingAssignmentId, player) -
          opponentStrength,
      );
      const gamesPlayed = standing?.gamesPlayed ?? 0;
      const levelDifference = Math.abs(
        LEVEL_SCORES[player.level] - LEVEL_SCORES[outgoingPlayer.level],
      );
      const consecutiveRoundPenalty =
        standing?.lastPlayedRound === round.roundNumber - 1;

      return {
        playerId: player.id,
        balanceGap,
        gamesPlayed,
        levelDifference,
        consecutiveRoundPenalty,
        fairnessScore:
          balanceGap * 100 +
          levelDifference * 20 +
          (consecutiveRoundPenalty ? 12 : 0) +
          gamesPlayed * 4,
      };
    })
    .sort(
      (left, right) =>
        left.fairnessScore - right.fairnessScore ||
        left.gamesPlayed - right.gamesPlayed ||
        left.playerId.localeCompare(right.playerId),
    );
}

export function fairReplacementPool(
  rankedCandidates: ReplacementCandidate[],
): ReplacementCandidate[] {
  const best = rankedCandidates[0];
  if (!best) return [];

  return rankedCandidates
    .filter((candidate) => candidate.fairnessScore <= best.fairnessScore + 40)
    .slice(0, 3);
}
