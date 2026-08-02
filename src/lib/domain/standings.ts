import type {
  MatchRecord,
  PlayerRecord,
  PlayerStanding,
  RoundRecord,
  Team,
} from "./types";

function participantsByTeam(match: MatchRecord, team: Team): string[] {
  return [...new Set(match.assignments.filter((item) => item.team === team).map((item) => item.playerId))];
}

export function calculateStandings(
  players: PlayerRecord[],
  rounds: RoundRecord[],
): PlayerStanding[] {
  const standings = new Map<string, PlayerStanding>();

  for (const player of players) {
    standings.set(player.id, {
      playerId: player.id,
      name: player.name,
      level: player.level,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      leaderboardPoints: 0,
      winRate: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifference: 0,
      lastPlayedRound: null,
      currentCourt: null,
      nextCourt: null,
      status: player.active ? "waiting" : "inactive",
    });
  }

  for (const round of rounds) {
    for (const match of round.matches) {
      const teamA = participantsByTeam(match, "a");
      const teamB = participantsByTeam(match, "b");

      if (match.status === "live") {
        for (const playerId of [...teamA, ...teamB]) {
          const row = standings.get(playerId);
          if (row) {
            row.currentCourt = match.courtNumber;
            row.status = "playing";
          }
        }
      }

      if (match.status === "planned") {
        for (const playerId of [...teamA, ...teamB]) {
          const row = standings.get(playerId);
          if (row && row.status !== "playing") {
            row.nextCourt = match.courtNumber;
            row.status = "up-next";
          }
        }
      }

      if (match.status !== "completed" || !match.winner) continue;

      const updateTeam = (playerIds: string[], team: Team) => {
        const won = match.winner === team;
        const pointsFor = team === "a" ? match.teamAScore : match.teamBScore;
        const pointsAgainst = team === "a" ? match.teamBScore : match.teamAScore;

        for (const playerId of playerIds) {
          const row = standings.get(playerId);
          if (!row) continue;
          row.gamesPlayed += 1;
          row.wins += won ? 1 : 0;
          row.losses += won ? 0 : 1;
          row.pointsFor += pointsFor;
          row.pointsAgainst += pointsAgainst;
          row.lastPlayedRound = Math.max(row.lastPlayedRound ?? 0, round.roundNumber);
        }
      };

      updateTeam(teamA, "a");
      updateTeam(teamB, "b");
    }
  }

  const rows = [...standings.values()].map((row) => ({
    ...row,
    leaderboardPoints: row.wins * 3,
    winRate: row.gamesPlayed === 0 ? 0 : Math.round((row.wins / row.gamesPlayed) * 100),
    pointDifference: row.pointsFor - row.pointsAgainst,
  }));

  return rows.sort(
    (a, b) =>
      b.leaderboardPoints - a.leaderboardPoints ||
      b.pointDifference - a.pointDifference ||
      b.wins - a.wins ||
      a.gamesPlayed - b.gamesPlayed ||
      a.name.localeCompare(b.name),
  );
}
