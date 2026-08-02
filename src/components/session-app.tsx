"use client";

import Link from "next/link";
import {
  ArrowLeftRight,
  Calendar,
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
  SESSION_FALLBACK_POLL_MS,
  SESSION_UPDATED_EVENT,
  sessionRealtimeTopic,
} from "@/lib/realtime";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Brand } from "./brand";

type MainTab = "live" | "rounds" | "players" | "standings";

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

async function responsePayload(response: Response): Promise<SessionSnapshot> {
  const payload = (await response.json()) as { data?: SessionSnapshot; error?: string };
  if (!response.ok || !payload.data) throw new Error(payload.error ?? "The request could not be completed.");
  return payload.data;
}

export function SessionApp({ identifier, mode }: { identifier: string; mode: "host" | "shared" }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<MainTab>("live");
  const [roundsView, setRoundsView] = useState<"next" | "completed">("next");
  const [showLineup, setShowLineup] = useState(false);
  const [scoreMatchId, setScoreMatchId] = useState<string | null>(null);
  const [substituteMatchId, setSubstituteMatchId] = useState<string | null>(null);
  const dialogOpenRef = useRef(false);

  const apiBase = mode === "host" ? `/api/sessions/${identifier}` : `/api/share/${identifier}`;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(apiBase, { cache: "no-store" });
      setSnapshot(await responsePayload(response));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load this session.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    dialogOpenRef.current = Boolean(scoreMatchId || substituteMatchId);
  }, [scoreMatchId, substituteMatchId]);

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
  const substituteMatch = substituteMatchId
    ? snapshot.rounds.flatMap((round) => round.matches).find((match) => match.id === substituteMatchId) ?? null
    : null;

  async function generate(review: boolean) {
    if (mode !== "host") return null;
    const data = await perform("generate", `${apiBase}/rounds/generate`);
    if (data && review) {
      setShowLineup(true);
      setTab("live");
    }
    return data;
  }

  async function startRound() {
    if (mode !== "host") return;
    const data = await perform("start", `${apiBase}/rounds/start`);
    if (data) {
      setShowLineup(false);
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
    const teamAScore = winner === "a" ? 21 : loserScore;
    const teamBScore = winner === "b" ? 21 : loserScore;
    const path = mode === "host"
      ? `${apiBase}/matches/${match.id}/score`
      : `${apiBase}/matches/${match.id}/score`;
    const data = await perform(`score-${match.id}`, path, { winner, teamAScore, teamBScore });
    if (data) {
      setScoreMatchId(null);
      setNotice(`Court ${match.courtNumber} result saved: ${teamAScore}–${teamBScore}.`);
    }
  }

  async function copyShareLink() {
    const link = `${window.location.origin}/s/${session.shareCode}`;
    await navigator.clipboard.writeText(link);
    setNotice("Viewer link copied. Anyone with the link can view and submit live scores.");
  }

  async function endSession() {
    if (!window.confirm("End this session? Live rounds must be completed first.")) return;
    const data = await perform("end", `${apiBase}/end`);
    if (data) setNotice("Session ended. History and standings remain available.");
  }

  return (
    <div className="site-shell session-site">
      <header className="topbar session-topbar">
        <div className="container topbar-inner">
          <Brand />
          <div className="topbar-actions">
            <span className={`mode-badge ${mode === "shared" ? "viewer" : ""}`}>
              {mode === "host" ? <ShieldCheck size={14} aria-hidden /> : <Users size={14} aria-hidden />}
              {mode === "host" ? "HOST MODE" : "SHARED VIEW"}
            </span>
            <button className="button ghost compact share-label" onClick={copyShareLink}><Share2 size={16} aria-hidden /> Share</button>
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
            <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item === "live" ? "Live" : item[0].toUpperCase() + item.slice(1)}</button>
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
            setShowLineup={setShowLineup}
            onScore={setScoreMatchId}
            onSubstitute={setSubstituteMatchId}
            onGenerate={() => void generate(true)}
            onStart={() => void startRound()}
            onStartDirect={() => void startNextDirect()}
            onReplace={(assignmentId, playerId) => perform("replace", `${apiBase}/lineup/swap`, { assignmentId, replacementPlayerId: playerId })}
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
            onReplace={(assignmentId, playerId) => perform("replace", `${apiBase}/lineup/swap`, { assignmentId, replacementPlayerId: playerId })}
            working={working}
          />
        ) : null}
        {tab === "players" ? <PlayersPanel snapshot={snapshot} /> : null}
        {tab === "standings" ? <StandingsPanel standings={snapshot.standings} /> : null}
      </main>

      <footer className="site-footer"><div className="container footer-inner"><Brand compact /><span>Updates refresh automatically for everyone with the session link.</span></div></footer>

      {scoreMatch ? (
        <ScoreDialog
          match={scoreMatch}
          players={snapshot.players}
          saving={working === `score-${scoreMatch.id}`}
          canCorrect={snapshot.permissions.isHost}
          onClose={() => setScoreMatchId(null)}
          onSave={(winner, loserScore) => void saveScore(scoreMatch, winner, loserScore)}
        />
      ) : null}
      {substituteMatch ? (
        <SubstitutionDialog
          match={substituteMatch}
          snapshot={snapshot}
          saving={working === "substitute"}
          onClose={() => setSubstituteMatchId(null)}
          onSave={async (outgoingAssignmentId, replacementPlayerId) => {
            const data = await perform("substitute", `${apiBase}/matches/${substituteMatch.id}/substitute`, { outgoingAssignmentId, replacementPlayerId });
            if (data) {
              setSubstituteMatchId(null);
              setNotice("Player substitution recorded for this live match.");
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
  onStart,
  onStartDirect,
  onReplace,
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
  onStart: () => void;
  onStartDirect: () => void;
  onReplace: (assignmentId: number, playerId: string) => Promise<SessionSnapshot | null>;
  working: string | null;
}) {
  const canManage = snapshot.permissions.canManageSession;
  const visibleRound = liveRound ?? latestCompletedRound;

  if (showLineup && plannedRound) {
    return (
      <section className="tab-panel">
        <div className="panel-heading"><div><p className="eyebrow">Review before play</p><h2>Round {plannedRound.roundNumber} lineup</h2><p>Games played are shown beside every player. Replace anyone with a waiting player before starting.</p></div><button className="button ghost compact" onClick={() => setShowLineup(false)}><X size={16} /> Close review</button></div>
        <LineupReview snapshot={snapshot} round={plannedRound} onReplace={onReplace} working={working} />
        {canManage ? <div className="sticky-action"><div><strong>Lineup reviewed?</strong><span>Starting locks all courts in this round.</span></div><button className="button primary" onClick={onStart} disabled={working !== null}><Play size={17} /> Start Round {plannedRound.roundNumber}</button></div> : null}
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
        <div className="next-panel-head"><div><p className="eyebrow">Up next</p><h2>{plannedRound ? `Round ${plannedRound.roundNumber}` : "Next round"}</h2></div><span className={`state-chip ${plannedRound ? "ready" : "pending"}`}>{plannedRound ? "READY" : liveRound ? "WAITING" : "AVAILABLE"}</span></div>
        {plannedRound ? <MiniLineup round={plannedRound} players={snapshot.players} /> : liveRound ? <p className="next-message">Finish every live court before the next lineup can be generated.</p> : snapshot.session.status !== "ended" ? <p className="next-message">SportRound will prioritize rested players and keep total games balanced.</p> : <p className="next-message">This session has ended.</p>}
        {canManage && snapshot.session.status !== "ended" ? <div className="next-actions">
          {plannedRound ? <button className="button secondary" onClick={() => setShowLineup(true)}>Review lineup</button> : <button className="button secondary" onClick={onGenerate} disabled={Boolean(liveRound) || working !== null}><RefreshCw size={16} /> Review next lineup</button>}
          <button className="button primary" onClick={plannedRound ? onStart : onStartDirect} disabled={Boolean(liveRound) || working !== null}><Play size={16} /> Start next game</button>
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
      <div className="court-surface">
        <span className="court-net" aria-hidden /><span className="service-line service-one" aria-hidden /><span className="service-line service-two" aria-hidden />
        <TeamHalf team="a" assignments={teamA} score={match.teamAScore} winner={match.winner} playerMap={playerMap} standingMap={standingMap} />
        <TeamHalf team="b" assignments={teamB} score={match.teamBScore} winner={match.winner} playerMap={playerMap} standingMap={standingMap} />
      </div>
      <footer className="court-card-foot">
        <span>{match.substitutions.length ? `${match.substitutions.length} player substitution recorded` : match.status === "completed" ? "Final score saved" : "Score is shared after Save Score"}</span>
        <div>
          {match.status === "live" && snapshot.permissions.canManageSession ? <button className="button ghost compact" onClick={() => onSubstitute(match.id)}><UserRoundCog size={16} /> Replace player</button> : null}
          {(match.status === "live" || (match.status === "completed" && snapshot.permissions.isHost)) && snapshot.permissions.canSubmitScore ? <button className="button primary compact" onClick={() => onScore(match.id)}><Edit3 size={16} /> {match.status === "completed" ? "Correct result" : "Update score"}</button> : null}
        </div>
      </footer>
    </article>
  );
}

function TeamHalf({ team, assignments, score, winner, playerMap, standingMap }: { team: Team; assignments: AssignmentRecord[]; score: number; winner: Team | null; playerMap: Map<string, PlayerRecord>; standingMap: Map<string, PlayerStanding> }) {
  const isWinner = winner === team;
  return (
    <div className={`court-half ${isWinner ? "winner" : winner ? "loser" : ""}`}>
      <div className="court-team-copy">
        {isWinner ? <span className="winner-badge"><Trophy size={12} /> WINNER</span> : null}
        <div className="team-players">{assignments.map((assignment) => { const player = playerMap.get(assignment.playerId); const standing = standingMap.get(assignment.playerId); return player ? <div key={assignment.id}><strong>{player.name}</strong><span>{LEVEL_LABELS[player.level]} · {standing?.gamesPlayed ?? 0} played</span></div> : null; })}</div>
      </div>
      <strong className="court-score">{String(score).padStart(2, "0")}</strong>
    </div>
  );
}

function MiniLineup({ round, players }: { round: RoundRecord; players: PlayerRecord[] }) {
  const map = new Map(players.map((player) => [player.id, player.name]));
  return <div className="mini-lineup">{round.matches.map((match) => <div key={match.id}><span>COURT {match.courtNumber}</span><strong>{activeTeam(match, "a").map((item) => map.get(item.playerId)).join(" + ")}</strong><em>vs</em><strong>{activeTeam(match, "b").map((item) => map.get(item.playerId)).join(" + ")}</strong></div>)}</div>;
}

function LineupReview({ snapshot, round, onReplace, working }: { snapshot: SessionSnapshot; round: RoundRecord; onReplace: (assignmentId: number, playerId: string) => Promise<SessionSnapshot | null>; working: string | null }) {
  const [choices, setChoices] = useState<Record<number, string>>({});
  const playerMap = new Map(snapshot.players.map((player) => [player.id, player]));
  const standingMap = new Map(snapshot.standings.map((standing) => [standing.playerId, standing]));
  const assignedIds = new Set(round.matches.flatMap((match) => match.assignments.filter((item) => item.active).map((item) => item.playerId)));
  const waiting = snapshot.players.filter((player) => player.active && !assignedIds.has(player.id));

  return <div className="lineup-review"><div className="lineup-courts">{round.matches.map((match) => <article className="lineup-court" key={match.id}><header><span>COURT {match.courtNumber}</span><span>BALANCED PAIRING</span></header>{(["a", "b"] as Team[]).map((team) => <div className="lineup-team" key={team}><span>TEAM {team.toUpperCase()}</span>{activeTeam(match, team).map((assignment) => { const player = playerMap.get(assignment.playerId); const standing = standingMap.get(assignment.playerId); return player ? <div className="lineup-player" key={assignment.id}><div><strong>{player.name}</strong><span>{LEVEL_LABELS[player.level]} · {standing?.gamesPlayed ?? 0} played</span></div>{snapshot.permissions.canManageSession && waiting.length ? <div className="replace-control"><select aria-label={`Replacement for ${player.name}`} value={choices[assignment.id] ?? ""} onChange={(event) => setChoices((current) => ({ ...current, [assignment.id]: event.target.value }))}><option value="">Replace…</option>{waiting.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name} · {standingMap.get(candidate.id)?.gamesPlayed ?? 0} played</option>)}</select><button className="icon-button" disabled={!choices[assignment.id] || working !== null} onClick={() => void onReplace(assignment.id, choices[assignment.id])} aria-label={`Confirm replacement for ${player.name}`}><ArrowLeftRight size={15} /></button></div> : null}</div> : null; })}</div>)}</article>)}</div><aside className="waiting-list"><p className="eyebrow">Waiting this round</p><h3>{waiting.length} players resting</h3>{waiting.map((player) => <div key={player.id}><span><strong>{player.name}</strong><small>{LEVEL_LABELS[player.level]}</small></span><b>{standingMap.get(player.id)?.gamesPlayed ?? 0} played</b></div>)}</aside></div>;
}

function RoundsPanel({ snapshot, plannedRound, completedRounds, view, setView, onScore, onStart, onGenerate, onReplace, working }: { snapshot: SessionSnapshot; plannedRound: RoundRecord | null; completedRounds: RoundRecord[]; view: "next" | "completed"; setView: (view: "next" | "completed") => void; onScore: (id: string) => void; onStart: () => void; onGenerate: () => void; onReplace: (assignmentId: number, playerId: string) => Promise<SessionSnapshot | null>; working: string | null }) {
  return <section className="tab-panel"><div className="panel-heading"><div><p className="eyebrow">Round directory</p><h2>Next and completed</h2><p>Review upcoming lineups or audit every saved court result.</p></div></div><div className="subtabs"><button className={view === "next" ? "active" : ""} onClick={() => setView("next")}>Next</button><button className={view === "completed" ? "active" : ""} onClick={() => setView("completed")}>Completed <span>{completedRounds.length}</span></button></div>{view === "next" ? plannedRound ? <><LineupReview snapshot={snapshot} round={plannedRound} onReplace={onReplace} working={working} />{snapshot.permissions.canManageSession ? <div className="sticky-action"><div><strong>Round {plannedRound.roundNumber} is ready</strong><span>All courts start together.</span></div><button className="button primary" onClick={onStart} disabled={working !== null}><Play size={17} /> Start next game</button></div> : null}</> : <div className="empty-panel"><RefreshCw /><h3>No generated lineup</h3><p>Generate the next round after all current courts finish.</p>{snapshot.permissions.canManageSession && snapshot.session.status !== "ended" ? <button className="button primary" onClick={onGenerate} disabled={working !== null}>Generate next lineup</button> : null}</div> : <div className="history-list">{completedRounds.length ? completedRounds.map((round) => <section className="history-round" key={round.id}><header><div><p className="eyebrow">COMPLETED</p><h3>Round {round.roundNumber}</h3></div><span>{round.completedAt ? formatDateTime(round.completedAt, snapshot.session.timezone) : "Completed"}</span></header><div className="court-list">{round.matches.map((match) => <CourtCard key={match.id} match={match} snapshot={snapshot} onScore={onScore} onSubstitute={() => undefined} />)}</div></section>) : <div className="empty-panel"><Trophy /><h3>No completed rounds yet</h3><p>Saved final scores will appear here for everyone.</p></div>}</div>}</section>;
}

function PlayersPanel({ snapshot }: { snapshot: SessionSnapshot }) {
  return <section className="tab-panel"><div className="panel-heading"><div><p className="eyebrow">Rotation visibility</p><h2>Players</h2><p>Everyone can see who is playing, waiting, and how many games each person has played.</p></div><span className="count-badge">{snapshot.players.length} ACTIVE</span></div><div className="player-table"><div className="table-head"><span>Player</span><span>Level</span><span>Played</span><span>Status</span></div>{snapshot.standings.map((standing) => <div className="table-row" key={standing.playerId}><strong>{standing.name}</strong><span><i className={`level-dot ${standing.level}`} /> {LEVEL_LABELS[standing.level]}</span><b>{standing.gamesPlayed}</b><span className={`player-status ${standing.status}`}>{standing.status === "playing" ? `Playing · Court ${standing.currentCourt}` : standing.status === "up-next" ? `Up next · Court ${standing.nextCourt}` : standing.status === "inactive" ? "Inactive" : "Waiting"}</span></div>)}</div></section>;
}

function StandingsPanel({ standings }: { standings: PlayerStanding[] }) {
  return <section className="tab-panel"><div className="panel-heading"><div><p className="eyebrow">Leaderboard</p><h2>Standings</h2><p>A win earns 3 points. Ties are ordered by point difference, then total wins.</p></div><span className="rules-note"><Trophy size={15} /> WIN = 3 PTS</span></div><div className="standings-table"><div className="standings-head"><span>Rank</span><span>Player</span><span>Games</span><span>W–L</span><span>Points</span><span>Win rate</span><span>+/−</span></div>{standings.map((standing, index) => <div className={`standings-row ${index < 3 ? "podium" : ""}`} key={standing.playerId}><b className="rank">{index + 1}</b><span><strong>{standing.name}</strong><small>{LEVEL_LABELS[standing.level]}</small></span><span>{standing.gamesPlayed}</span><span>{standing.wins}–{standing.losses}</span><b className="leader-points">{standing.leaderboardPoints}</b><span>{standing.winRate}%</span><span className={standing.pointDifference > 0 ? "positive" : standing.pointDifference < 0 ? "negative" : ""}>{standing.pointDifference > 0 ? "+" : ""}{standing.pointDifference}</span></div>)}</div></section>;
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

function SubstitutionDialog({ match, snapshot, saving, onClose, onSave }: { match: MatchRecord; snapshot: SessionSnapshot; saving: boolean; onClose: () => void; onSave: (outgoingAssignmentId: number, replacementPlayerId: string) => Promise<void> }) {
  const activeAssignments = match.assignments.filter((assignment) => assignment.active);
  const playingIds = new Set(snapshot.rounds.find((round) => round.status === "live")?.matches.flatMap((candidate) => candidate.assignments.filter((assignment) => assignment.active).map((assignment) => assignment.playerId)) ?? []);
  const available = snapshot.players.filter((player) => player.active && !playingIds.has(player.id));
  const [outgoing, setOutgoing] = useState(String(activeAssignments[0]?.id ?? ""));
  const [replacement, setReplacement] = useState(available[0]?.id ?? "");
  const playerMap = new Map(snapshot.players.map((player) => [player.id, player]));
  return <div className="modal-backdrop"><section className="small-dialog" role="dialog" aria-modal="true" aria-labelledby="replace-title"><header><div><p className="eyebrow">LIVE SUBSTITUTION</p><h2 id="replace-title">Replace a Court {match.courtNumber} player</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><p>The original player remains in match history. The replacement takes the same team and slot.</p><label className="field"><span>Player leaving</span><select value={outgoing} onChange={(event) => setOutgoing(event.target.value)}>{activeAssignments.map((assignment) => <option value={assignment.id} key={assignment.id}>{playerMap.get(assignment.playerId)?.name} · Team {assignment.team.toUpperCase()}</option>)}</select></label><label className="field"><span>Replacement from waiting list</span><select value={replacement} onChange={(event) => setReplacement(event.target.value)}><option value="">Select waiting player</option>{available.map((player) => <option value={player.id} key={player.id}>{player.name} · {LEVEL_LABELS[player.level]} · {snapshot.standings.find((standing) => standing.playerId === player.id)?.gamesPlayed ?? 0} played</option>)}</select></label><footer><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={!outgoing || !replacement || saving} onClick={() => void onSave(Number(outgoing), replacement)}>{saving ? "Replacing…" : "Confirm replacement"}</button></footer></section></div>;
}
