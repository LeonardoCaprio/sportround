"use client";

import Link from "next/link";
import {
  ArrowLeftRight,
  Calendar,
  Camera,
  Check,
  Clock3,
  Edit3,
  LoaderCircle,
  MapPin,
  Minus,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Share2,
  ShieldCheck,
  Trophy,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AssignmentRecord,
  MatchRecord,
  PlayerRecord,
  PlayerStanding,
  RoundRecord,
  SessionSnapshot,
  Team,
} from "@/lib/domain/types";
import { LEVEL_LABELS } from "@/lib/domain/types";
import {
  fairReplacementPool,
  rankReplacementCandidates,
  type ReplacementCandidate,
} from "@/lib/domain/replacement";
import {
  SESSION_FALLBACK_POLL_MS,
  SESSION_UPDATED_EVENT,
  sessionRealtimeTopic,
} from "@/lib/realtime";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Brand } from "./brand";

type MainTab = "live" | "rounds" | "players" | "standings";
type SharedUnavailableReason = "ended" | "expired";
type ReplacementRequest = {
  kind: "live" | "planned";
  matchId: string;
  outgoingAssignmentId?: number;
};

class SessionResponseError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason?: SharedUnavailableReason,
  ) {
    super(message);
  }
}

function activeTeam(match: MatchRecord, team: Team): AssignmentRecord[] {
  return match.assignments
    .filter((assignment) => assignment.active && assignment.team === team)
    .sort((left, right) => left.slot - right.slot);
}

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function elapsed(start: string | null, end: string | null) {
  if (!start) return "Not started";
  const finish = end ? new Date(end).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((finish - new Date(start).getTime()) / 60_000));
  return `${minutes} min`;
}

function SharedUnavailableScreen({ reason }: { reason: SharedUnavailableReason }) {
  const ended = reason === "ended";
  return (
    <div className="shared-unavailable-page">
      <header className="shared-unavailable-header"><Brand /></header>
      <main className="shared-unavailable-card">
        <span className="shared-unavailable-icon" aria-hidden><ShieldCheck /></span>
        <p className="eyebrow">VIEW-ONLY SESSION CLOSED</p>
        <h1>{ended ? "This session has ended" : "This shared session has expired"}</h1>
        <p>
          {ended
            ? "The host has closed this session. Live courts, lineups, scores, standings, and round history are no longer available from this shared link."
            : "The scheduled play window has finished, so this shared link is no longer available. The host can still open the session and end it from the host workspace."}
        </p>
        <div className="shared-unavailable-note">
          <strong>{ended ? "Thanks for playing." : "No session data is shown after expiry."}</strong>
          <span>Only the host can reopen their private workspace.</span>
        </div>
        <Link className="button secondary" href="/">Back to SportRound</Link>
      </main>
    </div>
  );
}

async function responsePayload(response: Response): Promise<SessionSnapshot> {
  const payload = (await response.json()) as {
    data?: SessionSnapshot;
    error?: string;
    details?: { reason?: SharedUnavailableReason };
  };
  if (!response.ok || !payload.data) {
    throw new SessionResponseError(
      payload.error ?? "The request could not be completed.",
      response.status,
      payload.details?.reason,
    );
  }
  return payload.data;
}

export function SessionApp({ identifier, mode }: { identifier: string; mode: "host" | "shared" }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sharedUnavailable, setSharedUnavailable] = useState<SharedUnavailableReason | null>(null);
  const [tab, setTab] = useState<MainTab>("live");
  const [roundsView, setRoundsView] = useState<"next" | "completed">("next");
  const [showLineup, setShowLineup] = useState(false);
  const [captureStandings, setCaptureStandings] = useState(false);
  const [scoreMatchId, setScoreMatchId] = useState<string | null>(null);
  const [replacementRequest, setReplacementRequest] = useState<ReplacementRequest | null>(null);
  const dialogOpenRef = useRef(false);

  const apiBase = mode === "host" ? `/api/sessions/${identifier}` : `/api/share/${identifier}`;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(apiBase, { cache: "no-store" });
      setSnapshot(await responsePayload(response));
      setSharedUnavailable(null);
      setError(null);
    } catch (loadError) {
      if (
        mode === "shared" &&
        loadError instanceof SessionResponseError &&
        loadError.status === 410 &&
        loadError.reason
      ) {
        setSnapshot(null);
        setScoreMatchId(null);
        setReplacementRequest(null);
        setSharedUnavailable(loadError.reason);
        setError(null);
      } else {
        setError(loadError instanceof Error ? loadError.message : "Could not load this session.");
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [apiBase, mode]);

  useEffect(() => {
    dialogOpenRef.current = Boolean(scoreMatchId || replacementRequest);
  }, [replacementRequest, scoreMatchId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  useEffect(() => {
    const refreshIfAvailable = () => {
      if (document.visibilityState === "visible" && !dialogOpenRef.current) void load(true);
    };
    const timer = window.setInterval(refreshIfAvailable, SESSION_FALLBACK_POLL_MS);
    document.addEventListener("visibilitychange", refreshIfAvailable);
    window.addEventListener("online", refreshIfAvailable);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfAvailable);
      window.removeEventListener("online", refreshIfAvailable);
    };
  }, [load]);

  const shareCode = snapshot?.session.shareCode;
  const sharedExpiresAt = mode === "shared" && snapshot
    ? new Date(snapshot.session.scheduledStart).getTime() + snapshot.session.durationMinutes * 60_000
    : null;

  useEffect(() => {
    if (sharedExpiresAt === null) return;

    let timer: number | undefined;
    let cancelled = false;
    const scheduleExpiryRefresh = () => {
      const remaining = sharedExpiresAt - Date.now();
      if (remaining <= 0) {
        void load(true);
        return;
      }
      timer = window.setTimeout(
        () => {
          if (!cancelled) scheduleExpiryRefresh();
        },
        Math.min(remaining + 100, 2_147_000_000),
      );
    };

    scheduleExpiryRefresh();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [load, sharedExpiresAt]);

  useEffect(() => {
    if (!shareCode) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(sessionRealtimeTopic(shareCode), {
        config: { private: false, broadcast: { self: false } },
      })
      .on("broadcast", { event: SESSION_UPDATED_EVENT }, () => {
        if (document.visibilityState === "visible" && !dialogOpenRef.current) void load(true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, shareCode]);

  useEffect(() => {
    const restoreView = window.setTimeout(() => {
      const search = new URLSearchParams(window.location.search);
      const requested = search.get("tab");
      if (requested === "rounds" || requested === "players" || requested === "standings") {
        setTab(requested);
      }
      if (search.get("lineup") === "1") setShowLineup(true);
    }, 0);
    return () => window.clearTimeout(restoreView);
  }, []);

  const changeLineupReview = useCallback((visible: boolean) => {
    setShowLineup(visible);
    const url = new URL(window.location.href);
    if (visible) url.searchParams.set("lineup", "1");
    else url.searchParams.delete("lineup");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const perform = useCallback(async (key: string, path: string, body?: unknown) => {
    setWorking(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await responsePayload(response);
      setSnapshot(data);
      return data;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The action could not be completed.");
      return null;
    } finally {
      setWorking(null);
    }
  }, []);

  if (loading) {
    return <div className="full-loader"><Brand /><LoaderCircle className="spin" aria-hidden /><span>Loading live session…</span></div>;
  }

  if (mode === "shared" && sharedUnavailable) {
    return <SharedUnavailableScreen reason={sharedUnavailable} />;
  }

  if (!snapshot) {
    return <div className="error-page"><Brand /><h1>Session unavailable</h1><p>{error}</p><Link className="button secondary" href="/">Back home</Link></div>;
  }

  const session = snapshot.session;
  const plannedRound = snapshot.rounds.find((round) => round.status === "planned") ?? null;
  const liveRound = snapshot.rounds.find((round) => round.status === "live") ?? null;
  const completedRounds = snapshot.rounds.filter((round) => round.status === "completed").sort((a, b) => b.roundNumber - a.roundNumber);
  const scoreMatch = scoreMatchId
    ? snapshot.rounds.flatMap((round) => round.matches).find((match) => match.id === scoreMatchId) ?? null
    : null;
  const replacementMatch = replacementRequest
    ? snapshot.rounds.flatMap((round) => round.matches).find((match) => match.id === replacementRequest.matchId) ?? null
    : null;

  async function generate(review: boolean) {
    if (mode !== "host") return null;
    const data = await perform("generate", `${apiBase}/rounds/generate`);
    if (data && review) {
      changeLineupReview(true);
      setTab("live");
    }
    return data;
  }

  async function regenerate(review: boolean) {
    if (mode !== "host") return null;
    const data = await perform("regenerate", `${apiBase}/rounds/regenerate`);
    if (data) {
      setNotice("The next-round lineup has been regenerated.");
      if (review) {
        changeLineupReview(true);
        setTab("live");
      }
    }
    return data;
  }

  async function startRound() {
    if (mode !== "host") return;
    const data = await perform("start", `${apiBase}/rounds/start`);
    if (data) {
      changeLineupReview(false);
      setNotice(`Round ${data.session.currentRoundNumber} is now live.`);
    }
  }

  async function startNextDirect() {
    if (!snapshot) return;
    let current: SessionSnapshot = snapshot;
    if (!plannedRound) {
      const generated = await generate(false);
      if (!generated) return;
      current = generated;
    }
    if (current.rounds.some((round) => round.status === "planned")) await startRound();
  }

  async function saveScore(match: MatchRecord, winner: Team, loserScore: number) {
    if (mode !== "host") return;
    const teamAScore = winner === "a" ? 21 : loserScore;
    const teamBScore = winner === "b" ? 21 : loserScore;
    const path = `${apiBase}/matches/${match.id}/score`;
    const data = await perform(`score-${match.id}`, path, { winner, teamAScore, teamBScore });
    if (data) {
      setScoreMatchId(null);
      setNotice(`Court ${match.courtNumber} result saved: ${teamAScore}–${teamBScore}.`);
    }
  }

  async function copyShareLink() {
    const link = `${window.location.origin}/s/${session.shareCode}`;
    await navigator.clipboard.writeText(link);
    setNotice("View-only link copied. It closes when the session ends or its scheduled time expires.");
  }

  async function endSession() {
    if (!window.confirm("End this session? Live rounds must be completed first.")) return;
    const data = await perform("end", `${apiBase}/end`);
    if (data) setNotice("Session ended. History and standings remain available.");
  }

  return (
    <div className={`site-shell session-site ${captureStandings ? "capture-standings" : ""}`}>
      <header className="topbar session-topbar">
        <div className="container topbar-inner">
          <Brand />
          <div className="topbar-actions">
            <span className={`mode-badge ${mode === "shared" ? "viewer" : ""}`}>
              {mode === "host" ? <ShieldCheck size={14} aria-hidden /> : <Users size={14} aria-hidden />}
              {mode === "host" ? "HOST MODE" : "VIEW ONLY"}
            </span>
            {mode === "host" ? <button className="button ghost compact share-label" onClick={copyShareLink}><Share2 size={16} aria-hidden /> Share</button> : null}
          </div>
        </div>
      </header>

      <main className="container session-main">
        <section className="session-summary">
          <div className="session-title-block"><p className="eyebrow">{session.status === "ended" ? "COMPLETED SESSION" : "LIVE WORKSPACE"}</p><h1>{session.name}</h1></div>
          <div className="session-meta-grid">
            <div><MapPin aria-hidden /><span><small>Venue</small><strong>{session.venue}</strong></span></div>
            <div><Calendar aria-hidden /><span><small>Schedule</small><strong>{formatDateTime(session.scheduledStart, session.timezone)}</strong></span></div>
            <div><Clock3 aria-hidden /><span><small>Duration</small><strong>{formatDuration(session.durationMinutes)}</strong></span></div>
          </div>
          <div className="session-status-row">
            <span className={`status-pill ${session.status}`}><Radio size={14} aria-hidden /> {session.status === "draft" ? "LINEUP READY" : session.status === "live" ? `ROUND ${session.currentRoundNumber} LIVE` : "SESSION ENDED"}</span>
            <span>{session.courtCount} courts</span><span>{snapshot.players.filter((player) => player.active).length} players</span><span>{session.gameFormat}</span>
            {mode === "host" && session.status !== "ended" ? <button className="text-link danger-link" onClick={endSession} disabled={working === "end"}>End session</button> : null}
          </div>
        </section>

        <nav className="session-tabs" aria-label="Session navigation">
          {(["live", "rounds", "players", "standings"] as MainTab[]).map((item) => (
            <button className={tab === item ? "active" : ""} key={item} onClick={() => { setTab(item); if (item !== "standings") setCaptureStandings(false); }}>{item === "live" ? "Live" : item[0].toUpperCase() + item.slice(1)}</button>
          ))}
        </nav>

        {error ? <div className="alert error" role="alert"><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error"><X size={17} /></button></div> : null}
        {notice ? <div className="alert success" role="status"><Check size={17} /><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={17} /></button></div> : null}

        {tab === "live" ? (
          <LivePanel
            snapshot={snapshot}
            liveRound={liveRound}
            latestCompletedRound={completedRounds[0] ?? null}
            plannedRound={plannedRound}
            showLineup={showLineup}
            setShowLineup={changeLineupReview}
            onScore={setScoreMatchId}
            onSubstitute={(matchId) => setReplacementRequest({ kind: "live", matchId })}
            onGenerate={() => void generate(true)}
            onRegenerate={() => void regenerate(true)}
            onStart={() => void startRound()}
            onStartDirect={() => void startNextDirect()}
            onRequestReplace={(matchId, outgoingAssignmentId) => setReplacementRequest({ kind: "planned", matchId, outgoingAssignmentId })}
            working={working}
          />
        ) : null}

        {tab === "rounds" ? (
          <RoundsPanel
            snapshot={snapshot}
            plannedRound={plannedRound}
            completedRounds={completedRounds}
            view={roundsView}
            setView={setRoundsView}
            onScore={setScoreMatchId}
            onStart={() => void startRound()}
            onGenerate={() => void generate(true)}
            onRegenerate={() => void regenerate(true)}
            onRequestReplace={(matchId, outgoingAssignmentId) => setReplacementRequest({ kind: "planned", matchId, outgoingAssignmentId })}
            working={working}
          />
        ) : null}
        {tab === "players" ? <PlayersPanel snapshot={snapshot} /> : null}
        {tab === "standings" ? <StandingsPanel snapshot={snapshot} captureMode={captureStandings} onCaptureModeChange={setCaptureStandings} /> : null}
      </main>

      <footer className="site-footer"><div className="container footer-inner"><Brand compact /><span>{mode === "host" ? "Host changes refresh automatically for everyone with the view-only link." : "This view-only session refreshes automatically."}</span></div></footer>

      {mode === "host" && scoreMatch ? (
        <ScoreDialog
          match={scoreMatch}
          players={snapshot.players}
          saving={working === `score-${scoreMatch.id}`}
          canCorrect={snapshot.permissions.isHost}
          onClose={() => setScoreMatchId(null)}
          onSave={(winner, loserScore) => void saveScore(scoreMatch, winner, loserScore)}
        />
      ) : null}
      {mode === "host" && replacementRequest && replacementMatch ? (
        <ReplacementDialog
          match={replacementMatch}
          snapshot={snapshot}
          kind={replacementRequest.kind}
          initialOutgoingAssignmentId={replacementRequest.outgoingAssignmentId}
          saving={working === "substitute" || working === "replace"}
          onClose={() => setReplacementRequest(null)}
          onSave={async (outgoingAssignmentId, replacementPlayerId) => {
            const data = replacementRequest.kind === "live"
              ? await perform("substitute", `${apiBase}/matches/${replacementMatch.id}/substitute`, { outgoingAssignmentId, replacementPlayerId })
              : await perform("replace", `${apiBase}/lineup/swap`, { assignmentId: outgoingAssignmentId, replacementPlayerId });
            if (data) {
              setReplacementRequest(null);
              setNotice(replacementRequest.kind === "live" ? "Player substitution recorded for this live match." : "The planned lineup has been updated.");
            }
          }}
        />
      ) : null}
    </div>
  );
}

function LivePanel({
  snapshot,
  liveRound,
  latestCompletedRound,
  plannedRound,
  showLineup,
  setShowLineup,
  onScore,
  onSubstitute,
  onGenerate,
  onRegenerate,
  onStart,
  onStartDirect,
  onRequestReplace,
  working,
}: {
  snapshot: SessionSnapshot;
  liveRound: RoundRecord | null;
  latestCompletedRound: RoundRecord | null;
  plannedRound: RoundRecord | null;
  showLineup: boolean;
  setShowLineup: (value: boolean) => void;
  onScore: (id: string) => void;
  onSubstitute: (id: string) => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onStart: () => void;
  onStartDirect: () => void;
  onRequestReplace: (matchId: string, assignmentId: number) => void;
  working: string | null;
}) {
  const canManage = snapshot.permissions.canManageSession;
  const visibleRound = liveRound ?? latestCompletedRound;
  const activeCourtCount = liveRound?.matches.filter((match) => match.status === "live").length ?? 0;
  const lineupNeedsReview = Boolean(
    plannedRound &&
      liveRound?.matches.some((match) =>
        match.substitutions.some(
          (substitution) => new Date(substitution.createdAt).getTime() > new Date(plannedRound.createdAt).getTime(),
        ),
      ),
  );

  if (showLineup && plannedRound) {
    return (
      <section className="tab-panel">
        <div className="panel-heading"><div><p className="eyebrow">Review before play</p><h2>Round {plannedRound.roundNumber} lineup</h2><p>Games played are shown beside every player. Replace anyone with a waiting player before starting.</p></div><button className="button ghost compact" onClick={() => setShowLineup(false)}><X size={16} /> Close review</button></div>
        {lineupNeedsReview ? <div className="lineup-warning" role="status"><div><strong>Lineup needs review</strong><span>A live player replacement happened after this lineup was prepared. Review it or regenerate a fresh rotation.</span></div>{canManage ? <button className="button secondary compact" onClick={onRegenerate} disabled={working !== null}><RefreshCw size={15} /> Regenerate</button> : null}</div> : null}
        <LineupReview snapshot={snapshot} round={plannedRound} onRequestReplace={onRequestReplace} working={working} />
        {canManage ? <div className="sticky-action"><div><strong>{liveRound ? `Waiting for ${activeCourtCount} active court${activeCourtCount === 1 ? "" : "s"}` : "Lineup reviewed?"}</strong><span>{liveRound ? "You can keep editing this lineup while the current round finishes." : "Starting locks all courts in this round."}</span></div><div className="sticky-action-buttons"><button className="button secondary" onClick={onRegenerate} disabled={working !== null}><RefreshCw size={16} /> Regenerate</button><button className="button primary" onClick={onStart} disabled={Boolean(liveRound) || working !== null}><Play size={17} /> {liveRound ? "Waiting for current round" : `Start Round ${plannedRound.roundNumber}`}</button></div></div> : null}
      </section>
    );
  }

  return (
    <section className="tab-panel live-layout">
      <div className="main-column">
        <div className="panel-heading"><div><p className="eyebrow">Current courts</p><h2>{visibleRound ? `Round ${visibleRound.roundNumber}` : "No round is running"}</h2><p>{liveRound ? "Completed courts stay visible with their winner." : latestCompletedRound ? "The latest completed courts remain visible until the next round starts." : plannedRound ? "The next lineup is ready for review." : "Every court from the previous round is complete."}</p></div></div>
        {visibleRound ? <div className="court-list">{visibleRound.matches.map((match) => <CourtCard key={match.id} match={match} snapshot={snapshot} onScore={onScore} onSubstitute={onSubstitute} />)}</div> : (
          <div className="empty-panel"><Trophy aria-hidden /><h3>{plannedRound ? `Round ${plannedRound.roundNumber} is ready` : snapshot.session.status === "ended" ? "Session complete" : "Ready for the next game"}</h3><p>{plannedRound ? "Review the pairings or start immediately." : snapshot.session.status === "ended" ? "Open Completed rounds or Standings to review the session." : "Choose whether to review the generated lineup or start it directly."}</p></div>
        )}
      </div>
      <aside className="next-panel">
        <div className="next-panel-head"><div><p className="eyebrow">Up next</p><h2>{plannedRound ? `Round ${plannedRound.roundNumber}` : "Next round"}</h2></div><span className={`state-chip ${plannedRound ? "ready" : "pending"}`}>{plannedRound ? liveRound ? "PREPARED" : "READY" : "AVAILABLE"}</span></div>
        {plannedRound ? <><MiniLineup round={plannedRound} players={snapshot.players} />{liveRound ? <p className="next-ready-note">Lineup prepared · start unlocks after {activeCourtCount} active court{activeCourtCount === 1 ? "" : "s"} finish.</p> : null}</> : liveRound ? <p className="next-message">Prepare the next lineup now so waiting players can get ready. Current players count as a projected game.</p> : snapshot.session.status !== "ended" ? <p className="next-message">SportRound will prioritize rested players and keep total games balanced.</p> : <p className="next-message">This session has ended.</p>}
        {canManage && snapshot.session.status !== "ended" ? <div className="next-actions">
          {plannedRound ? <><button className="button secondary" onClick={() => setShowLineup(true)}>Review lineup</button><button className="button ghost" onClick={onRegenerate} disabled={working !== null}><RefreshCw size={16} /> Regenerate</button></> : <button className="button secondary" onClick={onGenerate} disabled={working !== null}><RefreshCw size={16} /> {liveRound ? "Prepare next lineup" : "Review next lineup"}</button>}
          <button className="button primary" onClick={plannedRound ? onStart : onStartDirect} disabled={Boolean(liveRound) || working !== null}><Play size={16} /> {liveRound ? "Waiting for current round" : "Start next game"}</button>
        </div> : null}
      </aside>
    </section>
  );
}

function CourtCard({ match, snapshot, onScore, onSubstitute }: { match: MatchRecord; snapshot: SessionSnapshot; onScore: (id: string) => void; onSubstitute: (id: string) => void }) {
  const playerMap = new Map(snapshot.players.map((player) => [player.id, player]));
  const standingMap = new Map(snapshot.standings.map((standing) => [standing.playerId, standing]));
  const teamA = activeTeam(match, "a");
  const teamB = activeTeam(match, "b");

  return (
    <article className={`court-card ${match.status}`} data-testid={`court-${match.courtNumber}`}>
      <header className="court-card-head"><div><span>COURT {match.courtNumber}</span>{match.status === "live" ? <span className="live-label"><i /> LIVE</span> : null}</div><span>{match.status === "completed" ? `FINISHED · ${elapsed(match.startedAt, match.completedAt)}` : elapsed(match.startedAt, null)}</span></header>
      <div className={`court-surface ${snapshot.session.gameFormat}`}>
        <span className="court-back-strip team-a" aria-hidden />
        <CourtPlayerZone team="a" assignments={teamA} winner={match.winner} playerMap={playerMap} standingMap={standingMap} />
        <CourtScoreCell team="a" score={match.teamAScore} winner={match.winner} />
        <span className="court-net" aria-hidden />
        <CourtScoreCell team="b" score={match.teamBScore} winner={match.winner} />
        <CourtPlayerZone team="b" assignments={teamB} winner={match.winner} playerMap={playerMap} standingMap={standingMap} />
        <span className="court-back-strip team-b" aria-hidden />
      </div>
      <footer className="court-card-foot">
        <span>{match.substitutions.length ? `${match.substitutions.length} player substitution recorded` : match.status === "completed" ? "Final score saved" : snapshot.permissions.isHost ? "Score is shared after Save Score" : "View only · score updates are host controlled"}</span>
        <div>
          {match.status === "live" && snapshot.permissions.canManageSession ? <button className="button ghost compact" onClick={() => onSubstitute(match.id)}><UserRoundCog size={16} /> Replace player</button> : null}
          {(match.status === "live" || (match.status === "completed" && snapshot.permissions.isHost)) && snapshot.permissions.canSubmitScore ? <button className="button primary compact" onClick={() => onScore(match.id)}><Edit3 size={16} /> {match.status === "completed" ? "Correct result" : "Update score"}</button> : null}
        </div>
      </footer>
    </article>
  );
}

function CourtPlayerZone({ team, assignments, winner, playerMap, standingMap }: { team: Team; assignments: AssignmentRecord[]; winner: Team | null; playerMap: Map<string, PlayerRecord>; standingMap: Map<string, PlayerStanding> }) {
  const isWinner = winner === team;
  return (
    <div className={`court-player-zone team-${team} ${assignments.length > 1 ? "doubles" : "singles"} ${isWinner ? "winner" : winner ? "loser" : ""}`}>
      {assignments.map((assignment) => {
        const player = playerMap.get(assignment.playerId);
        const standing = standingMap.get(assignment.playerId);
        return player ? <div className="court-player" key={assignment.id}><strong>{player.name}</strong><span>{LEVEL_LABELS[player.level]} · {standing?.gamesPlayed ?? 0} played</span></div> : null;
      })}
    </div>
  );
}

function CourtScoreCell({ team, score, winner }: { team: Team; score: number; winner: Team | null }) {
  const isWinner = winner === team;
  return <div className={`court-score-cell team-${team} ${isWinner ? "winner" : winner ? "loser" : ""}`}>{isWinner ? <span className="winner-badge"><Trophy size={12} /> WINNER</span> : null}<strong className="court-score">{String(score).padStart(2, "0")}</strong></div>;
}

function MiniLineup({ round, players }: { round: RoundRecord; players: PlayerRecord[] }) {
  const map = new Map(players.map((player) => [player.id, player.name]));
  return <div className="mini-lineup">{round.matches.map((match) => <div key={match.id}><span>COURT {match.courtNumber}</span><strong>{activeTeam(match, "a").map((item) => map.get(item.playerId)).join(" + ")}</strong><em>vs</em><strong>{activeTeam(match, "b").map((item) => map.get(item.playerId)).join(" + ")}</strong></div>)}</div>;
}

function LineupReview({ snapshot, round, onRequestReplace, working }: { snapshot: SessionSnapshot; round: RoundRecord; onRequestReplace: (matchId: string, assignmentId: number) => void; working: string | null }) {
  const playerMap = new Map(snapshot.players.map((player) => [player.id, player]));
  const standingMap = new Map(snapshot.standings.map((standing) => [standing.playerId, standing]));
  const assignedIds = new Set(round.matches.flatMap((match) => match.assignments.filter((item) => item.active).map((item) => item.playerId)));
  const waiting = snapshot.players.filter((player) => player.active && !assignedIds.has(player.id));

  return <div className="lineup-review"><div className="lineup-courts">{round.matches.map((match) => <article className="lineup-court" key={match.id}><header><span>COURT {match.courtNumber}</span><span>BALANCED PAIRING</span></header>{(["a", "b"] as Team[]).map((team) => <div className="lineup-team" key={team}><span>TEAM {team.toUpperCase()}</span>{activeTeam(match, team).map((assignment) => { const player = playerMap.get(assignment.playerId); const standing = standingMap.get(assignment.playerId); return player ? <div className="lineup-player" key={assignment.id}><div><strong>{player.name}</strong><span>{LEVEL_LABELS[player.level]} · {standing?.gamesPlayed ?? 0} played</span></div>{snapshot.permissions.canManageSession && waiting.length ? <button className="button ghost compact replace-control" disabled={working !== null} onClick={() => onRequestReplace(match.id, assignment.id)}><ArrowLeftRight size={15} /> Replace</button> : null}</div> : null; })}</div>)}</article>)}</div><aside className="waiting-list"><p className="eyebrow">Waiting this round</p><h3>{waiting.length} players resting</h3>{waiting.map((player) => <div key={player.id}><span><strong>{player.name}</strong><small>{LEVEL_LABELS[player.level]}</small></span><b>{standingMap.get(player.id)?.gamesPlayed ?? 0} played</b></div>)}</aside></div>;
}

function RoundsPanel({
  snapshot,
  plannedRound,
  completedRounds,
  view,
  setView,
  onScore,
  onStart,
  onGenerate,
  onRegenerate,
  onRequestReplace,
  working,
}: {
  snapshot: SessionSnapshot;
  plannedRound: RoundRecord | null;
  completedRounds: RoundRecord[];
  view: "next" | "completed";
  setView: (view: "next" | "completed") => void;
  onScore: (id: string) => void;
  onStart: () => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  onRequestReplace: (matchId: string, assignmentId: number) => void;
  working: string | null;
}) {
  const liveRound = snapshot.rounds.find((round) => round.status === "live") ?? null;
  const activeCourts = liveRound?.matches.filter((match) => match.status === "live").length ?? 0;

  return (
    <section className="tab-panel">
      <div className="panel-heading">
        <div><p className="eyebrow">Round directory</p><h2>Next and completed</h2><p>Prepare the next rotation while current courts play, or audit every saved result.</p></div>
      </div>
      <div className="subtabs">
        <button className={view === "next" ? "active" : ""} onClick={() => setView("next")}>Next</button>
        <button className={view === "completed" ? "active" : ""} onClick={() => setView("completed")}>Completed <span>{completedRounds.length}</span></button>
      </div>
      {view === "next" ? plannedRound ? (
        <>
          {liveRound ? <div className="lineup-warning"><div><strong>Prepared while Round {liveRound.roundNumber} is live</strong><span>Review or regenerate now. Starting unlocks after {activeCourts} active court{activeCourts === 1 ? "" : "s"} finish.</span></div></div> : null}
          <LineupReview snapshot={snapshot} round={plannedRound} onRequestReplace={onRequestReplace} working={working} />
          {snapshot.permissions.canManageSession ? (
            <div className="sticky-action">
              <div><strong>Round {plannedRound.roundNumber} is {liveRound ? "prepared" : "ready"}</strong><span>{liveRound ? "Current players already count toward rotation fairness." : "All courts start together."}</span></div>
              <div className="sticky-action-buttons">
                <button className="button secondary" onClick={onRegenerate} disabled={working !== null}><RefreshCw size={16} /> Regenerate</button>
                <button className="button primary" onClick={onStart} disabled={Boolean(liveRound) || working !== null}><Play size={17} /> {liveRound ? "Waiting for current round" : "Start next game"}</button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty-panel">
          <RefreshCw />
          <h3>No prepared lineup</h3>
          <p>{liveRound ? "Generate it now so the next players have time to get ready." : "SportRound will balance games played, rest, and player level."}</p>
          {snapshot.permissions.canManageSession && snapshot.session.status !== "ended" ? <button className="button primary" onClick={onGenerate} disabled={working !== null}>{liveRound ? "Prepare next lineup" : "Generate next lineup"}</button> : null}
        </div>
      ) : (
        <div className="history-list">
          {completedRounds.length ? completedRounds.map((round) => (
            <section className="history-round" key={round.id}>
              <header><div><p className="eyebrow">COMPLETED</p><h3>Round {round.roundNumber}</h3></div><span>{round.completedAt ? formatDateTime(round.completedAt, snapshot.session.timezone) : "Completed"}</span></header>
              <div className="court-list">{round.matches.map((match) => <CourtCard key={match.id} match={match} snapshot={snapshot} onScore={onScore} onSubstitute={() => undefined} />)}</div>
            </section>
          )) : <div className="empty-panel"><Trophy /><h3>No completed rounds yet</h3><p>Saved final scores will appear here while the shared session remains active.</p></div>}
        </div>
      )}
    </section>
  );
}

function PlayersPanel({ snapshot }: { snapshot: SessionSnapshot }) {
  return <section className="tab-panel"><div className="panel-heading"><div><p className="eyebrow">Rotation visibility</p><h2>Players</h2><p>Everyone can see who is playing, waiting, and how many games each person has played.</p></div><span className="count-badge">{snapshot.players.length} ACTIVE</span></div><div className="player-table"><div className="table-head"><span>Player</span><span>Level</span><span>Played</span><span>Status</span></div>{snapshot.standings.map((standing) => <div className="table-row" key={standing.playerId}><strong>{standing.name}</strong><span><i className={`level-dot ${standing.level}`} /> {LEVEL_LABELS[standing.level]}</span><b>{standing.gamesPlayed}</b><span className={`player-status ${standing.status}`}>{standing.status === "playing" ? `Playing · Court ${standing.currentCourt}` : standing.status === "up-next" ? `Up next · Court ${standing.nextCourt}` : standing.status === "inactive" ? "Inactive" : "Waiting"}</span></div>)}</div></section>;
}

function StandingsPanel({ snapshot, captureMode, onCaptureModeChange }: { snapshot: SessionSnapshot; captureMode: boolean; onCaptureModeChange: (value: boolean) => void }) {
  return (
    <section className="tab-panel standings-panel">
      {captureMode ? (
        <header className="standings-capture-header">
          <div><Brand compact /><span>{snapshot.session.status === "ended" ? "FINAL STANDINGS" : "LIVE STANDINGS"}</span></div>
          <h1>{snapshot.session.name}</h1>
          <p>{snapshot.session.venue} · {formatDateTime(snapshot.session.scheduledStart, snapshot.session.timezone)} · {snapshot.players.filter((player) => player.active).length} players</p>
          <button className="button ghost compact capture-exit" onClick={() => onCaptureModeChange(false)}><X size={15} /> Exit screenshot view</button>
        </header>
      ) : (
        <div className="panel-heading standings-heading">
          <div><p className="eyebrow">Leaderboard</p><h2>Standings</h2><p>A win earns 3 points. Ties are ordered by point difference, then total wins.</p></div>
          <div className="standings-tools"><span className="rules-note"><Trophy size={15} /> WIN = 3 PTS</span><button className="button secondary compact" onClick={() => onCaptureModeChange(true)}><Camera size={16} /> Screenshot view</button></div>
        </div>
      )}
      <div className="standings-table" aria-label="Player standings">
        <div className="standings-head"><span>#</span><span>Player</span><span>GP</span><span>W–L</span><span>Win</span><span>PTS</span><span>+/−</span></div>
        {snapshot.standings.map((standing, index) => (
          <div className={`standings-row ${index < 3 ? `podium podium-${index + 1}` : ""}`} key={standing.playerId}>
            <b className="rank">{index + 1}</b>
            <span className="standing-player"><strong>{standing.name}</strong><small>{LEVEL_LABELS[standing.level]}</small></span>
            <span>{standing.gamesPlayed}</span>
            <span>{standing.wins}–{standing.losses}</span>
            <span>{standing.winRate}%</span>
            <b className="leader-points">{standing.leaderboardPoints}</b>
            <span className={standing.pointDifference > 0 ? "positive" : standing.pointDifference < 0 ? "negative" : ""}>{standing.pointDifference > 0 ? "+" : ""}{standing.pointDifference}</span>
          </div>
        ))}
      </div>
      {captureMode ? <p className="capture-footnote">SportRound · Win = 3 pts · Ranked by points, point difference, then wins</p> : null}
    </section>
  );
}

function ScoreDialog({ match, players, saving, canCorrect, onClose, onSave }: { match: MatchRecord; players: PlayerRecord[]; saving: boolean; canCorrect: boolean; onClose: () => void; onSave: (winner: Team, loserScore: number) => void }) {
  const [winner, setWinner] = useState<Team | null>(match.winner);
  const [scores, setScores] = useState({ a: match.teamAScore, b: match.teamBScore });
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const names = (team: Team) => activeTeam(match, team).map((assignment) => playerMap.get(assignment.playerId)?.name).filter(Boolean).join(" + ");

  function markWinner(team: Team) {
    setWinner(team);
    setScores((current) => ({ ...current, [team]: 21, [team === "a" ? "b" : "a"]: Math.min(current[team === "a" ? "b" : "a"], 20) }));
  }

  function adjust(team: Team, delta: number) {
    if (!winner || winner === team) return;
    setScores((current) => ({ ...current, [team]: Math.max(0, Math.min(20, current[team] + delta)) }));
  }

  const losingTeam = winner === "a" ? "b" : "a";
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="score-dialog" role="dialog" aria-modal="true" aria-labelledby="score-title"><header><div><p className="eyebrow">{canCorrect && match.status === "completed" ? "CORRECT RESULT" : "SCORE EDITOR"}</p><h2 id="score-title">Court {match.courtNumber} final score</h2></div><button className="icon-button" onClick={onClose} aria-label="Close score editor"><X /></button></header><div className="score-help">Choose the winner, then adjust the losing score. The result stays private until Save Score.</div><div className="score-teams">{(["a", "b"] as Team[]).map((team) => <div className={`score-team ${winner === team ? "selected-winner" : ""} ${winner && winner !== team ? "selected-loser" : ""}`} key={team}><div className="score-team-head"><div><span>TEAM {team.toUpperCase()}</span><strong>{names(team)}</strong></div>{winner === team ? <span className="winner-badge"><Trophy size={12} /> WINNER</span> : null}</div><div className="score-controls"><button aria-label={`Subtract from Team ${team.toUpperCase()}`} onClick={() => adjust(team, -1)} disabled={!winner || winner === team || scores[team] <= 0}><Minus /></button><output aria-live="polite">{String(scores[team]).padStart(2, "0")}</output><button aria-label={`Add to Team ${team.toUpperCase()}`} onClick={() => adjust(team, 1)} disabled={!winner || winner === team || scores[team] >= 20}><Plus /></button></div><button className={`mark-winner ${winner === team ? "active" : ""}`} onClick={() => markWinner(team)}>{winner === team ? <><Check size={17} /> Marked as winner · 21</> : "Mark as winner · 21"}</button></div>)}</div><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!winner || saving} onClick={() => winner && onSave(winner, scores[losingTeam])}>{saving ? "Saving…" : "Save Score"}</button></footer></section></div>;
}

function ReplacementDialog({
  match,
  snapshot,
  kind,
  initialOutgoingAssignmentId,
  saving,
  onClose,
  onSave,
}: {
  match: MatchRecord;
  snapshot: SessionSnapshot;
  kind: "live" | "planned";
  initialOutgoingAssignmentId?: number;
  saving: boolean;
  onClose: () => void;
  onSave: (outgoingAssignmentId: number, replacementPlayerId: string) => Promise<void>;
}) {
  const activeAssignments = match.assignments.filter((assignment) => assignment.active);
  const round = snapshot.rounds.find((candidateRound) =>
    candidateRound.matches.some((candidateMatch) => candidateMatch.id === match.id),
  );
  const [outgoing, setOutgoing] = useState(
    String(initialOutgoingAssignmentId ?? activeAssignments[0]?.id ?? ""),
  );
  const [suggestion, setSuggestion] = useState<ReplacementCandidate | null>(null);
  const [seenSuggestions, setSeenSuggestions] = useState<string[]>([]);
  const playerMap = new Map(snapshot.players.map((player) => [player.id, player]));
  const rankedCandidates = round && outgoing
    ? rankReplacementCandidates({
        match,
        round,
        outgoingAssignmentId: Number(outgoing),
        players: snapshot.players,
        standings: snapshot.standings,
      })
    : [];
  const candidatePool = fairReplacementPool(rankedCandidates);
  const suggestedPlayer = suggestion ? playerMap.get(suggestion.playerId) : null;
  const suggestedStanding = suggestion
    ? snapshot.standings.find((standing) => standing.playerId === suggestion.playerId)
    : null;

  function changeOutgoing(value: string) {
    setOutgoing(value);
    setSuggestion(null);
    setSeenSuggestions([]);
  }

  function shuffleSuggestion() {
    if (candidatePool.length === 0) return;
    const unseen = candidatePool.filter(
      (candidate) => !seenSuggestions.includes(candidate.playerId),
    );
    const choices = unseen.length > 0 ? unseen : candidatePool;
    const random = new Uint32Array(1);
    window.crypto.getRandomValues(random);
    const selected = choices[random[0] % choices.length];
    setSuggestion(selected);
    setSeenSuggestions(
      unseen.length > 0
        ? [...seenSuggestions, selected.playerId]
        : [selected.playerId],
    );
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="small-dialog replacement-dialog" role="dialog" aria-modal="true" aria-labelledby="replace-title"><header><div><p className="eyebrow">{kind === "live" ? "LIVE REPLACEMENT" : "LINEUP REPLACEMENT"}</p><h2 id="replace-title">Replace a Court {match.courtNumber} player</h2></div><button className="icon-button" onClick={onClose} aria-label="Close replacement dialog"><X /></button></header><p>Choose who is leaving, then let SportRound suggest a fair waiting player based on court balance, level, rest, and games played.</p><label className="field"><span>Player leaving</span><select value={outgoing} onChange={(event) => changeOutgoing(event.target.value)}>{activeAssignments.map((assignment) => <option value={assignment.id} key={assignment.id}>{playerMap.get(assignment.playerId)?.name} · Team {assignment.team.toUpperCase()}</option>)}</select></label><section className={`replacement-suggestion ${suggestedPlayer ? "has-suggestion" : ""}`} aria-live="polite"><div><p className="eyebrow">SYSTEM SUGGESTION</p>{suggestedPlayer && suggestion ? <><h3>{suggestedPlayer.name}</h3><span>{LEVEL_LABELS[suggestedPlayer.level]} · {suggestedStanding?.gamesPlayed ?? 0} played</span><small>{suggestion.balanceGap === 0 ? "Keeps both teams level-balanced." : `Closest fair option · ${suggestion.balanceGap} level-point court gap.`}{suggestion.consecutiveRoundPenalty ? " Recently played, but still among the fairest available choices." : " Prioritizes a rested waiting player."}</small></> : <><h3>Ready to find a fair replacement</h3><span>{candidatePool.length ? `${candidatePool.length} best-balanced option${candidatePool.length === 1 ? "" : "s"} available` : "No waiting player is currently available"}</span><small>Shuffle only chooses from the system&apos;s best-balanced candidate pool.</small></>}</div><button className="button secondary" type="button" onClick={shuffleSuggestion} disabled={!outgoing || candidatePool.length === 0 || saving}><RefreshCw size={16} /> {suggestedPlayer ? "Shuffle again" : "Shuffle player"}</button></section><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!outgoing || !suggestedPlayer || saving} onClick={() => suggestedPlayer && void onSave(Number(outgoing), suggestedPlayer.id)}>{saving ? "Replacing…" : "Confirm replacement"}</button></footer></section></div>;
}
