import type { Team } from "./types";

export interface FinalScore {
  teamAScore: number;
  teamBScore: number;
  winner: Team;
}

export function buildFinalScore(winner: Team, losingScore: number): FinalScore {
  if (!Number.isInteger(losingScore) || losingScore < 0 || losingScore > 20) {
    throw new Error("The losing score must be a whole number from 0 to 20.");
  }

  return winner === "a"
    ? { teamAScore: 21, teamBScore: losingScore, winner }
    : { teamAScore: losingScore, teamBScore: 21, winner };
}

export function assertValidFinalScore(score: FinalScore): void {
  const winningScore = score.winner === "a" ? score.teamAScore : score.teamBScore;
  const losingScore = score.winner === "a" ? score.teamBScore : score.teamAScore;

  if (winningScore !== 21) {
    throw new Error("The selected winner must have exactly 21 points.");
  }

  if (!Number.isInteger(losingScore) || losingScore < 0 || losingScore > 20) {
    throw new Error("The losing score must be between 0 and 20.");
  }
}
