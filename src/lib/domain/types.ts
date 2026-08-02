export type PlayerLevel = "beginner" | "intermediate" | "pro";
export type GameFormat = "singles" | "doubles";
export type SessionStatus = "draft" | "live" | "ended";
export type RoundStatus = "planned" | "live" | "completed";
export type MatchStatus = "planned" | "live" | "completed";
export type Team = "a" | "b";

export interface SessionRecord {
  id: string;
  hostTokenHash: string;
  shareCode: string;
  name: string;
  sport: "badminton";
  venue: string;
  scheduledStart: string;
  durationMinutes: number;
  timezone: string;
  courtCount: number;
  gameFormat: GameFormat;
  status: SessionStatus;
  currentRoundNumber: number;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}

export interface PlayerRecord {
  id: string;
  sessionId: string;
  name: string;
  level: PlayerLevel;
  active: boolean;
  createdAt: string;
}

export interface AssignmentRecord {
  id: number;
  matchId: string;
  playerId: string;
  team: Team;
  slot: number;
  active: boolean;
  joinedAt: string;
  leftAt: string | null;
}

export interface SubstitutionRecord {
  id: number;
  matchId: string;
  outgoingAssignmentId: number;
  incomingAssignmentId: number;
  createdAt: string;
}

export interface MatchRecord {
  id: string;
  sessionId: string;
  roundId: string;
  courtNumber: number;
  status: MatchStatus;
  teamAScore: number;
  teamBScore: number;
  winner: Team | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  assignments: AssignmentRecord[];
  substitutions: SubstitutionRecord[];
}

export interface RoundRecord {
  id: string;
  sessionId: string;
  roundNumber: number;
  status: RoundStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  matches: MatchRecord[];
}

export interface SessionAggregate {
  session: SessionRecord;
  players: PlayerRecord[];
  rounds: RoundRecord[];
}

export interface CreatePlayerInput {
  name: string;
  level: PlayerLevel;
}

export interface CreateSessionInput {
  name: string;
  venue: string;
  scheduledStart: string;
  durationMinutes: number;
  timezone: string;
  courtCount: number;
  gameFormat: GameFormat;
  players: CreatePlayerInput[];
}

export interface MatchPlan {
  courtNumber: number;
  teamA: string[];
  teamB: string[];
}

export interface LineupPlan {
  roundNumber: number;
  matches: MatchPlan[];
  waitingPlayerIds: string[];
}

export interface PlayerStanding {
  playerId: string;
  name: string;
  level: PlayerLevel;
  gamesPlayed: number;
  wins: number;
  losses: number;
  leaderboardPoints: number;
  winRate: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  lastPlayedRound: number | null;
  currentCourt: number | null;
  nextCourt: number | null;
  status: "playing" | "up-next" | "waiting" | "inactive";
}

export interface SessionSnapshot {
  session: Omit<SessionRecord, "hostTokenHash">;
  players: PlayerRecord[];
  rounds: RoundRecord[];
  standings: PlayerStanding[];
  permissions: {
    isHost: boolean;
    canManageSession: boolean;
    canSubmitScore: boolean;
  };
}

export const LEVEL_LABELS: Record<PlayerLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  pro: "Pro",
};

export const LEVEL_SCORES: Record<PlayerLevel, number> = {
  beginner: 1,
  intermediate: 2,
  pro: 3,
};
