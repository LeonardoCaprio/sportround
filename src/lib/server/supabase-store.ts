import "server-only";

import { randomUUID } from "node:crypto";
import type { PostgrestError } from "@supabase/supabase-js";

import type {
  AssignmentRecord,
  CreateSessionInput,
  LineupPlan,
  MatchRecord,
  PlayerRecord,
  RoundRecord,
  SessionAggregate,
  SessionRecord,
  SubstitutionRecord,
  Team,
} from "@/lib/domain/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { ApiError } from "./api";
import type { SportRoundStore } from "./store";

type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];
type PlayerRow = Database["public"]["Tables"]["players"]["Row"];
type RoundRow = Database["public"]["Tables"]["rounds"]["Row"];
type AssignmentRow = Database["public"]["Tables"]["match_assignments"]["Row"];
type SubstitutionRow = Database["public"]["Tables"]["match_substitutions"]["Row"];

function databaseError(message: string, error: PostgrestError): never {
  console.error(message, error);
  throw new ApiError(500, message);
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    hostTokenHash: row.host_token_hash,
    shareCode: row.share_code,
    name: row.name,
    sport: row.sport,
    venue: row.venue,
    scheduledStart: row.scheduled_start,
    durationMinutes: row.duration_minutes,
    timezone: row.timezone,
    courtCount: row.court_count,
    gameFormat: row.game_format,
    status: row.status,
    currentRoundNumber: row.current_round_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    endedAt: row.ended_at,
  };
}

function mapPlayer(row: PlayerRow): PlayerRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    level: row.level,
    active: row.active,
    createdAt: row.created_at,
  };
}

function mapAssignment(row: AssignmentRow): AssignmentRecord {
  return {
    id: row.id,
    matchId: row.match_id,
    playerId: row.player_id,
    team: row.team,
    slot: row.slot,
    active: row.active,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
  };
}

function mapSubstitution(row: SubstitutionRow): SubstitutionRecord {
  return {
    id: row.id,
    matchId: row.match_id,
    outgoingAssignmentId: row.outgoing_assignment_id,
    incomingAssignmentId: row.incoming_assignment_id,
    createdAt: row.created_at,
  };
}

export class SupabaseSportRoundStore implements SportRoundStore {
  private readonly client = createSupabaseAdminClient();

  async createSession(
    input: CreateSessionInput,
    hostTokenHash: string,
    shareCode: string,
  ): Promise<SessionAggregate> {
    const sessionId = randomUUID();
    const { error: sessionError } = await this.client.from("sessions").insert({
      id: sessionId,
      host_token_hash: hostTokenHash,
      share_code: shareCode,
      name: input.name,
      venue: input.venue,
      scheduled_start: input.scheduledStart,
      duration_minutes: input.durationMinutes,
      timezone: input.timezone,
      court_count: input.courtCount,
      game_format: input.gameFormat,
    });
    if (sessionError) databaseError("Could not create the session.", sessionError);

    const players = input.players.map((player) => ({
      id: randomUUID(),
      session_id: sessionId,
      name: player.name,
      level: player.level,
    }));
    const { error: playersError } = await this.client.from("players").insert(players);
    if (playersError) {
      await this.client.from("sessions").delete().eq("id", sessionId);
      databaseError("Could not add the players.", playersError);
    }

    return this.requireSession(sessionId);
  }

  async getSessionById(sessionId: string): Promise<SessionAggregate | null> {
    const { data: session, error } = await this.client
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) databaseError("Could not load the session.", error);
    if (!session) return null;
    return this.loadAggregate(session);
  }

  async getSessionByShareCode(shareCode: string): Promise<SessionAggregate | null> {
    const { data: session, error } = await this.client
      .from("sessions")
      .select("*")
      .eq("share_code", shareCode.toUpperCase())
      .maybeSingle();
    if (error) databaseError("Could not load the shared session.", error);
    if (!session) return null;
    return this.loadAggregate(session);
  }

  private async requireSession(sessionId: string): Promise<SessionAggregate> {
    const aggregate = await this.getSessionById(sessionId);
    if (!aggregate) throw new ApiError(404, "Session not found.");
    return aggregate;
  }

  private async loadAggregate(session: SessionRow): Promise<SessionAggregate> {
    const [playersResult, roundsResult, matchesResult] = await Promise.all([
      this.client.from("players").select("*").eq("session_id", session.id).order("created_at"),
      this.client.from("rounds").select("*").eq("session_id", session.id).order("round_number"),
      this.client
        .from("matches")
        .select("*")
        .eq("session_id", session.id)
        .order("court_number"),
    ]);
    if (playersResult.error) databaseError("Could not load players.", playersResult.error);
    if (roundsResult.error) databaseError("Could not load rounds.", roundsResult.error);
    if (matchesResult.error) databaseError("Could not load matches.", matchesResult.error);

    const matchIds = matchesResult.data.map((match) => match.id);
    let assignments: AssignmentRow[] = [];
    let substitutions: SubstitutionRow[] = [];
    if (matchIds.length > 0) {
      const [assignmentsResult, substitutionsResult] = await Promise.all([
        this.client.from("match_assignments").select("*").in("match_id", matchIds).order("id"),
        this.client.from("match_substitutions").select("*").in("match_id", matchIds).order("id"),
      ]);
      if (assignmentsResult.error) databaseError("Could not load lineups.", assignmentsResult.error);
      if (substitutionsResult.error) {
        databaseError("Could not load substitutions.", substitutionsResult.error);
      }
      assignments = assignmentsResult.data;
      substitutions = substitutionsResult.data;
    }

    const matchesByRound = new Map<string, MatchRecord[]>();
    for (const match of matchesResult.data) {
      const mapped: MatchRecord = {
        id: match.id,
        sessionId: match.session_id,
        roundId: match.round_id,
        courtNumber: match.court_number,
        status: match.status,
        teamAScore: match.team_a_score,
        teamBScore: match.team_b_score,
        winner: match.winner,
        startedAt: match.started_at,
        completedAt: match.completed_at,
        updatedAt: match.updated_at,
        assignments: assignments.filter((item) => item.match_id === match.id).map(mapAssignment),
        substitutions: substitutions.filter((item) => item.match_id === match.id).map(mapSubstitution),
      };
      matchesByRound.set(match.round_id, [...(matchesByRound.get(match.round_id) ?? []), mapped]);
    }

    const rounds: RoundRecord[] = roundsResult.data.map((round: RoundRow) => ({
      id: round.id,
      sessionId: round.session_id,
      roundNumber: round.round_number,
      status: round.status,
      startedAt: round.started_at,
      completedAt: round.completed_at,
      createdAt: round.created_at,
      matches: matchesByRound.get(round.id) ?? [],
    }));

    return {
      session: mapSession(session),
      players: playersResult.data.map(mapPlayer),
      rounds,
    };
  }

  async createRound(sessionId: string, plan: LineupPlan): Promise<SessionAggregate> {
    const roundId = randomUUID();
    const { error: roundError } = await this.client.from("rounds").insert({
      id: roundId,
      session_id: sessionId,
      round_number: plan.roundNumber,
    });
    if (roundError) databaseError("Could not create the round.", roundError);

    const matches = plan.matches.map((match) => ({
      id: randomUUID(),
      session_id: sessionId,
      round_id: roundId,
      court_number: match.courtNumber,
      status: "planned" as const,
    }));
    const { error: matchesError } = await this.client.from("matches").insert(matches);
    if (matchesError) {
      await this.client.from("rounds").delete().eq("id", roundId);
      databaseError("Could not create the court matches.", matchesError);
    }

    const assignments = plan.matches.flatMap((match, matchIndex) => {
      const matchId = matches[matchIndex].id;
      return ([
        ["a", match.teamA],
        ["b", match.teamB],
      ] as const).flatMap(([team, playerIds]) =>
        playerIds.map((playerId, index) => ({
          match_id: matchId,
          player_id: playerId,
          team,
          slot: index + 1,
        })),
      );
    });
    const { error: assignmentsError } = await this.client
      .from("match_assignments")
      .insert(assignments);
    if (assignmentsError) {
      await this.client.from("rounds").delete().eq("id", roundId);
      databaseError("Could not create the player lineup.", assignmentsError);
    }

    return this.requireSession(sessionId);
  }

  async deletePlannedRound(sessionId: string, roundId: string): Promise<SessionAggregate> {
    const { data, error } = await this.client
      .from("rounds")
      .delete()
      .eq("id", roundId)
      .eq("session_id", sessionId)
      .eq("status", "planned")
      .select("id")
      .maybeSingle();
    if (error) databaseError("Could not remove the planned lineup.", error);
    if (!data) throw new ApiError(404, "Planned round not found.");
    return this.requireSession(sessionId);
  }

  async startRound(sessionId: string, roundId: string): Promise<SessionAggregate> {
    const timestamp = new Date().toISOString();
    const { data: round, error: roundError } = await this.client
      .from("rounds")
      .update({ status: "live", started_at: timestamp })
      .eq("id", roundId)
      .eq("session_id", sessionId)
      .eq("status", "planned")
      .select("round_number")
      .single();
    if (roundError) databaseError("Could not start the round.", roundError);

    const { error: matchesError } = await this.client
      .from("matches")
      .update({ status: "live", started_at: timestamp })
      .eq("round_id", roundId)
      .eq("status", "planned");
    if (matchesError) databaseError("Could not start the court matches.", matchesError);

    const { error: sessionError } = await this.client
      .from("sessions")
      .update({ status: "live", current_round_number: round.round_number })
      .eq("id", sessionId);
    if (sessionError) databaseError("Could not update the session.", sessionError);
    return this.requireSession(sessionId);
  }

  async saveScore(
    sessionId: string,
    matchId: string,
    score: { teamAScore: number; teamBScore: number; winner: Team },
  ): Promise<SessionAggregate> {
    const timestamp = new Date().toISOString();
    const { data: match, error: matchError } = await this.client
      .from("matches")
      .update({
        team_a_score: score.teamAScore,
        team_b_score: score.teamBScore,
        winner: score.winner,
        status: "completed",
        completed_at: timestamp,
      })
      .eq("id", matchId)
      .eq("session_id", sessionId)
      .select("round_id")
      .single();
    if (matchError) databaseError("Could not save the score.", matchError);

    const { data: roundMatches, error: roundMatchesError } = await this.client
      .from("matches")
      .select("status")
      .eq("round_id", match.round_id);
    if (roundMatchesError) databaseError("Could not check the round status.", roundMatchesError);
    if (roundMatches.every((candidate) => candidate.status === "completed")) {
      const { error: roundError } = await this.client
        .from("rounds")
        .update({ status: "completed", completed_at: timestamp })
        .eq("id", match.round_id);
      if (roundError) databaseError("Could not complete the round.", roundError);
    }
    return this.requireSession(sessionId);
  }

  async replacePlannedPlayer(
    sessionId: string,
    assignmentId: number,
    replacementPlayerId: string,
  ): Promise<SessionAggregate> {
    const aggregate = await this.requireSession(sessionId);
    const plannedRound = aggregate.rounds.find((round) => round.status === "planned");
    const assignment = plannedRound?.matches
      .flatMap((match) => match.assignments)
      .find((candidate) => candidate.id === assignmentId && candidate.active);
    if (!assignment) throw new ApiError(404, "Lineup assignment not found.");
    if (
      plannedRound?.matches.some((match) =>
        match.assignments.some(
          (candidate) => candidate.active && candidate.playerId === replacementPlayerId,
        ),
      )
    ) {
      throw new ApiError(409, "Choose a player who is currently waiting.");
    }
    const { error } = await this.client
      .from("match_assignments")
      .update({ player_id: replacementPlayerId })
      .eq("id", assignmentId);
    if (error) databaseError("Could not replace the player.", error);
    return this.requireSession(sessionId);
  }

  async substituteLivePlayer(
    sessionId: string,
    matchId: string,
    outgoingAssignmentId: number,
    replacementPlayerId: string,
  ): Promise<SessionAggregate> {
    const aggregate = await this.requireSession(sessionId);
    const liveRound = aggregate.rounds.find((round) => round.status === "live");
    const match = liveRound?.matches.find((candidate) => candidate.id === matchId);
    const outgoing = match?.assignments.find(
      (candidate) => candidate.id === outgoingAssignmentId && candidate.active,
    );
    if (!match || !outgoing) throw new ApiError(404, "Active player assignment not found.");
    if (
      liveRound?.matches.some((candidate) =>
        candidate.assignments.some(
          (assignment) => assignment.active && assignment.playerId === replacementPlayerId,
        ),
      )
    ) {
      throw new ApiError(409, "That player is already playing in this round.");
    }

    const timestamp = new Date().toISOString();
    const { error: outgoingError } = await this.client
      .from("match_assignments")
      .update({ active: false, left_at: timestamp })
      .eq("id", outgoingAssignmentId)
      .eq("active", true);
    if (outgoingError) databaseError("Could not release the outgoing player.", outgoingError);

    const { data: incoming, error: incomingError } = await this.client
      .from("match_assignments")
      .insert({
        match_id: matchId,
        player_id: replacementPlayerId,
        team: outgoing.team,
        slot: outgoing.slot,
        joined_at: timestamp,
      })
      .select("id")
      .single();
    if (incomingError) {
      await this.client
        .from("match_assignments")
        .update({ active: true, left_at: null })
        .eq("id", outgoingAssignmentId);
      databaseError("Could not add the replacement player.", incomingError);
    }

    const { error: substitutionError } = await this.client.from("match_substitutions").insert({
      match_id: matchId,
      outgoing_assignment_id: outgoingAssignmentId,
      incoming_assignment_id: incoming.id,
      created_at: timestamp,
    });
    if (substitutionError) databaseError("Could not record the substitution.", substitutionError);
    return this.requireSession(sessionId);
  }

  async endSession(sessionId: string): Promise<SessionAggregate> {
    const timestamp = new Date().toISOString();
    const { error } = await this.client
      .from("sessions")
      .update({ status: "ended", ended_at: timestamp })
      .eq("id", sessionId);
    if (error) databaseError("Could not end the session.", error);
    return this.requireSession(sessionId);
  }
}
