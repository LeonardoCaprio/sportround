import "server-only";

import type {
  CreateSessionInput,
  LineupPlan,
  SessionAggregate,
  Team,
} from "@/lib/domain/types";

export interface SportRoundStore {
  createSession(input: CreateSessionInput, hostTokenHash: string, shareCode: string): Promise<SessionAggregate>;
  getSessionById(sessionId: string): Promise<SessionAggregate | null>;
  getSessionByShareCode(shareCode: string): Promise<SessionAggregate | null>;
  createRound(sessionId: string, plan: LineupPlan): Promise<SessionAggregate>;
  startRound(sessionId: string, roundId: string): Promise<SessionAggregate>;
  saveScore(
    sessionId: string,
    matchId: string,
    score: { teamAScore: number; teamBScore: number; winner: Team },
  ): Promise<SessionAggregate>;
  replacePlannedPlayer(
    sessionId: string,
    assignmentId: number,
    replacementPlayerId: string,
  ): Promise<SessionAggregate>;
  substituteLivePlayer(
    sessionId: string,
    matchId: string,
    outgoingAssignmentId: number,
    replacementPlayerId: string,
  ): Promise<SessionAggregate>;
  endSession(sessionId: string): Promise<SessionAggregate>;
}
