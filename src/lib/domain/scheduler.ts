import { LEVEL_SCORES } from "./types";
import type {
  GameFormat,
  LineupPlan,
  MatchPlan,
  PlayerRecord,
  RoundRecord,
  Team,
} from "./types";

interface HistoryStats {
  games: number;
  lastRound: number;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: string): () => number {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    [result[index], result[swapWith]] = [result[swapWith], result[index]];
  }
  return result;
}

function pairKey(first: string, second: string): string {
  return [first, second].sort().join(":");
}

function collectHistory(rounds: RoundRecord[]) {
  const stats = new Map<string, HistoryStats>();
  const teammateCounts = new Map<string, number>();
  const opponentCounts = new Map<string, number>();

  for (const round of rounds) {
    for (const match of round.matches) {
      if (match.status === "planned") continue;
      const teams: Record<Team, string[]> = {
        a: [...new Set(match.assignments.filter((item) => item.team === "a").map((item) => item.playerId))],
        b: [...new Set(match.assignments.filter((item) => item.team === "b").map((item) => item.playerId))],
      };

      for (const playerId of [...teams.a, ...teams.b]) {
        const current = stats.get(playerId) ?? { games: 0, lastRound: 0 };
        if (match.status === "completed") current.games += 1;
        current.lastRound = Math.max(current.lastRound, round.roundNumber);
        stats.set(playerId, current);
      }

      for (const team of [teams.a, teams.b]) {
        for (let left = 0; left < team.length; left += 1) {
          for (let right = left + 1; right < team.length; right += 1) {
            const key = pairKey(team[left], team[right]);
            teammateCounts.set(key, (teammateCounts.get(key) ?? 0) + 1);
          }
        }
      }

      for (const first of teams.a) {
        for (const second of teams.b) {
          const key = pairKey(first, second);
          opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1);
        }
      }
    }
  }

  return { stats, teammateCounts, opponentCounts };
}

function chooseTeams(
  group: PlayerRecord[],
  format: GameFormat,
  teammateCounts: Map<string, number>,
): { teamA: PlayerRecord[]; teamB: PlayerRecord[]; score: number } {
  if (format === "singles") {
    const score = Math.abs(LEVEL_SCORES[group[0].level] - LEVEL_SCORES[group[1].level]);
    return { teamA: [group[0]], teamB: [group[1]], score };
  }

  const candidates = [
    [[group[0], group[1]], [group[2], group[3]]],
    [[group[0], group[2]], [group[1], group[3]]],
    [[group[0], group[3]], [group[1], group[2]]],
  ] as const;

  return candidates
    .map(([teamA, teamB]) => {
      const teamASkill = teamA.reduce((sum, player) => sum + LEVEL_SCORES[player.level], 0);
      const teamBSkill = teamB.reduce((sum, player) => sum + LEVEL_SCORES[player.level], 0);
      const repeatPenalty =
        (teammateCounts.get(pairKey(teamA[0].id, teamA[1].id)) ?? 0) +
        (teammateCounts.get(pairKey(teamB[0].id, teamB[1].id)) ?? 0);
      return {
        teamA: [...teamA],
        teamB: [...teamB],
        score: Math.abs(teamASkill - teamBSkill) * 10 + repeatPenalty * 8,
      };
    })
    .sort((a, b) => a.score - b.score)[0];
}

export function generateLineup(
  players: PlayerRecord[],
  rounds: RoundRecord[],
  courtCount: number,
  format: GameFormat,
  seed: string,
): LineupPlan {
  const activePlayers = players.filter((player) => player.active);
  const playersPerMatch = format === "doubles" ? 4 : 2;
  const usableCourts = Math.min(courtCount, Math.floor(activePlayers.length / playersPerMatch));
  const requiredPlayers = usableCourts * playersPerMatch;
  const nextRoundNumber = Math.max(0, ...rounds.map((round) => round.roundNumber)) + 1;

  if (usableCourts < 1) {
    throw new Error(`At least ${playersPerMatch} active players are required.`);
  }

  const history = collectHistory(rounds);
  const random = createRandom(`${seed}:${nextRoundNumber}`);
  const withStats = activePlayers.map((player) => ({
    player,
    stats: history.stats.get(player.id) ?? { games: 0, lastRound: 0 },
    tie: random(),
  }));
  const rested = withStats.filter((item) => item.stats.lastRound !== nextRoundNumber - 1);
  const consecutive = withStats.filter((item) => item.stats.lastRound === nextRoundNumber - 1);
  const sortFairly = (left: (typeof withStats)[number], right: (typeof withStats)[number]) =>
    left.stats.games - right.stats.games || left.stats.lastRound - right.stats.lastRound || left.tie - right.tie;

  rested.sort(sortFairly);
  consecutive.sort(sortFairly);
  const selected = [...rested.slice(0, requiredPlayers)];
  if (selected.length < requiredPlayers) {
    selected.push(...consecutive.slice(0, requiredPlayers - selected.length));
  }

  const selectedPlayers = selected.map((item) => item.player);
  let best: { matches: MatchPlan[]; score: number } | null = null;

  for (let attempt = 0; attempt < 240; attempt += 1) {
    const candidatePlayers = shuffle(selectedPlayers, random);
    const matches: MatchPlan[] = [];
    let score = 0;

    for (let courtIndex = 0; courtIndex < usableCourts; courtIndex += 1) {
      const group = candidatePlayers.slice(courtIndex * playersPerMatch, (courtIndex + 1) * playersPerMatch);
      const teams = chooseTeams(group, format, history.teammateCounts);
      score += teams.score;

      for (const first of teams.teamA) {
        for (const second of teams.teamB) {
          score += (history.opponentCounts.get(pairKey(first.id, second.id)) ?? 0) * 2;
        }
      }

      matches.push({
        courtNumber: courtIndex + 1,
        teamA: teams.teamA.map((player) => player.id),
        teamB: teams.teamB.map((player) => player.id),
      });
    }

    if (!best || score < best.score) best = { matches, score };
  }

  const selectedIds = new Set(selectedPlayers.map((player) => player.id));
  return {
    roundNumber: nextRoundNumber,
    matches: best?.matches ?? [],
    waitingPlayerIds: activePlayers.filter((player) => !selectedIds.has(player.id)).map((player) => player.id),
  };
}
