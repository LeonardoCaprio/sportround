import "server-only";

import { randomUUID } from "node:crypto";

import type {
  AssignmentRecord,
  CreateSessionInput,
  LineupPlan,
  MatchRecord,
  RoundRecord,
  SessionAggregate,
  SessionRecord,
  Team,
} from "@/lib/domain/types";
import { ApiError } from "./api";
import type { SportRoundStore } from "./store";

interface MemoryDatabase {
  sessions: Map<string, SessionAggregate>;
  assignmentSequence: number;
  substitutionSequence: number;
}

const memoryProcess = process as typeof process & {
  __sportRoundMemoryDatabase?: MemoryDatabase;
};

const database: MemoryDatabase = memoryProcess.__sportRoundMemoryDatabase ?? {
  sessions: new Map(),
  assignmentSequence: 0,
  substitutionSequence: 0,
};

memoryProcess.__sportRoundMemoryDatabase = database;

function now(): string {
  return new Date().toISOString();
}

function copy(aggregate: SessionAggregate): SessionAggregate {
  return structuredClone(aggregate);
}

function requireAggregate(sessionId: string): SessionAggregate {
  const aggregate = database.sessions.get(sessionId);
  if (!aggregate) throw new ApiError(404, "Session not found.");
  return aggregate;
}

function findMatch(aggregate: SessionAggregate, matchId: string): { round: RoundRecord; match: MatchRecord } {
  for (const round of aggregate.rounds) {
    const match = round.matches.find((candidate) => candidate.id === matchId);
    if (match) return { round, match };
  }
  throw new ApiError(404, "Match not found.");
}

export class MemorySportRoundStore implements SportRoundStore {
  async createSession(
    input: CreateSessionInput,
    hostTokenHash: string,
    shareCode: string,
  ): Promise<SessionAggregate> {
    const timestamp = now();
    const sessionId = randomUUID();
    const session: SessionRecord = {
      id: sessionId,
      hostTokenHash,
      shareCode,
      name: input.name,
      sport: "badminton",
      venue: input.venue,
      scheduledStart: input.scheduledStart,
      durationMinutes: input.durationMinutes,
      timezone: input.timezone,
      courtCount: input.courtCount,
      gameFormat: input.gameFormat,
      status: "draft",
      currentRoundNumber: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      endedAt: null,
    };
    const aggregate: SessionAggregate = {
      session,
      players: input.players.map((player) => ({
        id: randomUUID(),
        sessionId,
        name: player.name,
        level: player.level,
        active: true,
        createdAt: timestamp,
      })),
      rounds: [],
    };
    database.sessions.set(sessionId, aggregate);
    return copy(aggregate);
  }

  async getSessionById(sessionId: string): Promise<SessionAggregate | null> {
    const aggregate = database.sessions.get(sessionId);
    return aggregate ? copy(aggregate) : null;
  }

  async getSessionByShareCode(shareCode: string): Promise<SessionAggregate | null> {
    const normalized = shareCode.toUpperCase();
    const aggregate = [...database.sessions.values()].find(
      (candidate) => candidate.session.shareCode === normalized,
    );
    return aggregate ? copy(aggregate) : null;
  }

  async createRound(sessionId: string, plan: LineupPlan): Promise<SessionAggregate> {
    const aggregate = requireAggregate(sessionId);
    if (aggregate.rounds.some((round) => round.status === "planned")) {
      throw new ApiError(409, "A next-round lineup has already been prepared.");
    }
    const timestamp = now();
    const roundId = randomUUID();
    const round: RoundRecord = {
      id: roundId,
      sessionId,
      roundNumber: plan.roundNumber,
      status: "planned",
      startedAt: null,
      completedAt: null,
      createdAt: timestamp,
      matches: plan.matches.map((plannedMatch) => {
        const matchId = randomUUID();
        const assignments: AssignmentRecord[] = [];
        for (const [team, playerIds] of [
          ["a", plannedMatch.teamA],
          ["b", plannedMatch.teamB],
        ] as const) {
          playerIds.forEach((playerId, index) => {
            database.assignmentSequence += 1;
            assignments.push({
              id: database.assignmentSequence,
              matchId,
              playerId,
              team,
              slot: index + 1,
              active: true,
              joinedAt: timestamp,
              leftAt: null,
            });
          });
        }
        return {
          id: matchId,
          sessionId,
          roundId,
          courtNumber: plannedMatch.courtNumber,
          status: "planned",
          teamAScore: 0,
          teamBScore: 0,
          winner: null,
          startedAt: null,
          completedAt: null,
          updatedAt: timestamp,
          assignments,
          substitutions: [],
        };
      }),
    };
    aggregate.rounds.push(round);
    aggregate.session.updatedAt = timestamp;
    return copy(aggregate);
  }

  async deletePlannedRound(sessionId: string, roundId: string): Promise<SessionAggregate> {
    const aggregate = requireAggregate(sessionId);
    const index = aggregate.rounds.findIndex(
      (round) => round.id === roundId && round.status === "planned",
    );
    if (index < 0) throw new ApiError(404, "Planned round not found.");
    aggregate.rounds.splice(index, 1);
    aggregate.session.updatedAt = now();
    return copy(aggregate);
  }

  async startRound(sessionId: string, roundId: string): Promise<SessionAggregate> {
    const aggregate = requireAggregate(sessionId);
    const round = aggregate.rounds.find((candidate) => candidate.id === roundId);
    if (!round) throw new ApiError(404, "Round not found.");
    if (round.status !== "planned") throw new ApiError(409, "Only a planned round can be started.");
    if (aggregate.rounds.some((candidate) => candidate.status === "live")) {
      throw new ApiError(409, "Another round is still live.");
    }
    const timestamp = now();
    round.status = "live";
    round.startedAt = timestamp;
    round.matches.forEach((match) => {
      match.status = "live";
      match.startedAt = timestamp;
      match.updatedAt = timestamp;
    });
    aggregate.session.status = "live";
    aggregate.session.currentRoundNumber = round.roundNumber;
    aggregate.session.updatedAt = timestamp;
    return copy(aggregate);
  }

  async saveScore(
    sessionId: string,
    matchId: string,
    score: { teamAScore: number; teamBScore: number; winner: Team },
  ): Promise<SessionAggregate> {
    const aggregate = requireAggregate(sessionId);
    const { round, match } = findMatch(aggregate, matchId);
    const timestamp = now();
    match.teamAScore = score.teamAScore;
    match.teamBScore = score.teamBScore;
    match.winner = score.winner;
    match.status = "completed";
    match.completedAt = timestamp;
    match.updatedAt = timestamp;
    if (round.matches.every((candidate) => candidate.status === "completed")) {
      round.status = "completed";
      round.completedAt = timestamp;
    }
    aggregate.session.updatedAt = timestamp;
    return copy(aggregate);
  }

  async replacePlannedPlayer(
    sessionId: string,
    assignmentId: number,
    replacementPlayerId: string,
  ): Promise<SessionAggregate> {
    const aggregate = requireAggregate(sessionId);
    const plannedRound = aggregate.rounds.find((round) => round.status === "planned");
    if (!plannedRound) throw new ApiError(409, "There is no planned round to edit.");
    const assignment = plannedRound.matches
      .flatMap((match) => match.assignments)
      .find((candidate) => candidate.id === assignmentId && candidate.active);
    if (!assignment) throw new ApiError(404, "Lineup assignment not found.");
    const alreadyAssigned = plannedRound.matches.some((match) =>
      match.assignments.some((candidate) => candidate.active && candidate.playerId === replacementPlayerId),
    );
    if (alreadyAssigned) throw new ApiError(409, "Choose a player who is currently waiting.");
    assignment.playerId = replacementPlayerId;
    aggregate.session.updatedAt = now();
    return copy(aggregate);
  }

  async substituteLivePlayer(
    sessionId: string,
    matchId: string,
    outgoingAssignmentId: number,
    replacementPlayerId: string,
  ): Promise<SessionAggregate> {
    const aggregate = requireAggregate(sessionId);
    const { round, match } = findMatch(aggregate, matchId);
    if (round.status !== "live" || match.status !== "live") {
      throw new ApiError(409, "Players can only be substituted during a live match.");
    }
    const playingInRound = round.matches.some((candidate) =>
      candidate.assignments.some(
        (assignment) => assignment.active && assignment.playerId === replacementPlayerId,
      ),
    );
    if (playingInRound) throw new ApiError(409, "That player is already playing in this round.");
    const outgoing = match.assignments.find(
      (assignment) => assignment.id === outgoingAssignmentId && assignment.active,
    );
    if (!outgoing) throw new ApiError(404, "Active player assignment not found.");
    const timestamp = now();
    outgoing.active = false;
    outgoing.leftAt = timestamp;
    database.assignmentSequence += 1;
    const incoming: AssignmentRecord = {
      id: database.assignmentSequence,
      matchId,
      playerId: replacementPlayerId,
      team: outgoing.team,
      slot: outgoing.slot,
      active: true,
      joinedAt: timestamp,
      leftAt: null,
    };
    match.assignments.push(incoming);
    database.substitutionSequence += 1;
    match.substitutions.push({
      id: database.substitutionSequence,
      matchId,
      outgoingAssignmentId,
      incomingAssignmentId: incoming.id,
      createdAt: timestamp,
    });
    match.updatedAt = timestamp;
    aggregate.session.updatedAt = timestamp;
    return copy(aggregate);
  }

  async endSession(sessionId: string): Promise<SessionAggregate> {
    const aggregate = requireAggregate(sessionId);
    if (aggregate.rounds.some((round) => round.status === "live")) {
      throw new ApiError(409, "Complete all live matches before ending the session.");
    }
    const timestamp = now();
    aggregate.session.status = "ended";
    aggregate.session.endedAt = timestamp;
    aggregate.session.updatedAt = timestamp;
    return copy(aggregate);
  }
}
