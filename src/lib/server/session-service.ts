import "server-only";

import { assertValidFinalScore, type FinalScore } from "@/lib/domain/scoring";
import { generateLineup } from "@/lib/domain/scheduler";
import { toSnapshot } from "@/lib/domain/snapshot";
import type { CreateSessionInput, SessionAggregate, SessionSnapshot } from "@/lib/domain/types";
import { ApiError } from "./api";
import { broadcastSessionUpdate } from "./realtime";
import { createHostToken, createShareCode, hashHostToken, tokenMatches } from "./security";
import { getStore } from "./store-factory";

const HOST_PERMISSIONS: SessionSnapshot["permissions"] = {
  isHost: true,
  canManageSession: true,
  canSubmitScore: true,
};

const VIEWER_PERMISSIONS: SessionSnapshot["permissions"] = {
  isHost: false,
  canManageSession: false,
  canSubmitScore: true,
};

async function toUpdatedSnapshot(
  aggregate: SessionAggregate,
  permissions: SessionSnapshot["permissions"],
): Promise<SessionSnapshot> {
  const snapshot = toSnapshot(aggregate, permissions);
  await broadcastSessionUpdate(snapshot.session.shareCode);
  return snapshot;
}

async function requireHost(sessionId: string, hostToken: string | undefined): Promise<SessionAggregate> {
  const store = await getStore();
  const aggregate = await store.getSessionById(sessionId);
  if (!aggregate) throw new ApiError(404, "Session not found.");
  if (!tokenMatches(hostToken, aggregate.session.hostTokenHash)) {
    throw new ApiError(403, "Only the session host can perform this action.");
  }
  return aggregate;
}

async function requireSharedSession(shareCode: string): Promise<SessionAggregate> {
  const store = await getStore();
  const aggregate = await store.getSessionByShareCode(shareCode);
  if (!aggregate) throw new ApiError(404, "Shared session not found.");
  return aggregate;
}

export async function createSession(input: CreateSessionInput) {
  const store = await getStore();
  const hostToken = createHostToken();
  let shareCode = createShareCode();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (!(await store.getSessionByShareCode(shareCode))) break;
    shareCode = createShareCode();
  }
  let aggregate = await store.createSession(input, hashHostToken(hostToken), shareCode);
  const lineup = generateLineup(
    aggregate.players,
    aggregate.rounds,
    aggregate.session.courtCount,
    aggregate.session.gameFormat,
    aggregate.session.id,
  );
  aggregate = await store.createRound(aggregate.session.id, lineup);
  return { hostToken, snapshot: toSnapshot(aggregate, HOST_PERMISSIONS) };
}

export async function getHostSession(sessionId: string, hostToken?: string): Promise<SessionSnapshot> {
  return toSnapshot(await requireHost(sessionId, hostToken), HOST_PERMISSIONS);
}

export async function getSharedSession(shareCode: string): Promise<SessionSnapshot> {
  return toSnapshot(await requireSharedSession(shareCode), VIEWER_PERMISSIONS);
}

export async function generateNextRound(sessionId: string, hostToken?: string): Promise<SessionSnapshot> {
  const aggregate = await requireHost(sessionId, hostToken);
  if (aggregate.session.status === "ended") throw new ApiError(409, "This session has ended.");
  if (aggregate.rounds.some((round) => round.status !== "completed")) {
    throw new ApiError(409, "Complete the current round before generating the next lineup.");
  }
  const lineup = generateLineup(
    aggregate.players,
    aggregate.rounds,
    aggregate.session.courtCount,
    aggregate.session.gameFormat,
    aggregate.session.id,
  );
  const updated = await (await getStore()).createRound(sessionId, lineup);
  return toUpdatedSnapshot(updated, HOST_PERMISSIONS);
}

export async function startPlannedRound(sessionId: string, hostToken?: string): Promise<SessionSnapshot> {
  const aggregate = await requireHost(sessionId, hostToken);
  if (aggregate.session.status === "ended") throw new ApiError(409, "This session has ended.");
  const planned = aggregate.rounds.find((round) => round.status === "planned");
  if (!planned) throw new ApiError(409, "Generate or review a lineup before starting.");
  if (aggregate.rounds.some((round) => round.status === "live")) {
    throw new ApiError(409, "Complete the live round before starting another one.");
  }
  const updated = await (await getStore()).startRound(sessionId, planned.id);
  return toUpdatedSnapshot(updated, HOST_PERMISSIONS);
}

export async function saveHostScore(
  sessionId: string,
  matchId: string,
  hostToken: string | undefined,
  score: FinalScore,
): Promise<SessionSnapshot> {
  assertValidFinalScore(score);
  const aggregate = await requireHost(sessionId, hostToken);
  const match = aggregate.rounds.flatMap((round) => round.matches).find((item) => item.id === matchId);
  if (!match) throw new ApiError(404, "Match not found.");
  if (match.status === "planned") throw new ApiError(409, "Start the round before saving a score.");
  const updated = await (await getStore()).saveScore(sessionId, matchId, score);
  return toUpdatedSnapshot(updated, HOST_PERMISSIONS);
}

export async function saveSharedScore(
  shareCode: string,
  matchId: string,
  score: FinalScore,
): Promise<SessionSnapshot> {
  assertValidFinalScore(score);
  const aggregate = await requireSharedSession(shareCode);
  const match = aggregate.rounds.flatMap((round) => round.matches).find((item) => item.id === matchId);
  if (!match) throw new ApiError(404, "Match not found.");
  if (match.status !== "live") throw new ApiError(409, "Only a live match can be scored by viewers.");
  const updated = await (await getStore()).saveScore(aggregate.session.id, matchId, score);
  return toUpdatedSnapshot(updated, VIEWER_PERMISSIONS);
}

export async function replaceLineupPlayer(
  sessionId: string,
  hostToken: string | undefined,
  assignmentId: number,
  replacementPlayerId: string,
): Promise<SessionSnapshot> {
  const aggregate = await requireHost(sessionId, hostToken);
  const replacement = aggregate.players.find(
    (player) => player.id === replacementPlayerId && player.active,
  );
  if (!replacement) throw new ApiError(404, "Replacement player not found.");
  const updated = await (await getStore()).replacePlannedPlayer(
    sessionId,
    assignmentId,
    replacementPlayerId,
  );
  return toUpdatedSnapshot(updated, HOST_PERMISSIONS);
}

export async function substitutePlayer(
  sessionId: string,
  matchId: string,
  hostToken: string | undefined,
  outgoingAssignmentId: number,
  replacementPlayerId: string,
): Promise<SessionSnapshot> {
  const aggregate = await requireHost(sessionId, hostToken);
  const replacement = aggregate.players.find(
    (player) => player.id === replacementPlayerId && player.active,
  );
  if (!replacement) throw new ApiError(404, "Replacement player not found.");
  const updated = await (await getStore()).substituteLivePlayer(
    sessionId,
    matchId,
    outgoingAssignmentId,
    replacementPlayerId,
  );
  return toUpdatedSnapshot(updated, HOST_PERMISSIONS);
}

export async function endHostSession(sessionId: string, hostToken?: string): Promise<SessionSnapshot> {
  const aggregate = await requireHost(sessionId, hostToken);
  if (aggregate.rounds.some((round) => round.status === "live")) {
    throw new ApiError(409, "Complete every live court before ending the session.");
  }
  const updated = await (await getStore()).endSession(sessionId);
  return toUpdatedSnapshot(updated, HOST_PERMISSIONS);
}
