"use client";

import { useRouter } from "next/navigation";
import { Plus, Trash2, Users } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import type { PlayerLevel, SessionSnapshot } from "@/lib/domain/types";

interface PlayerDraft {
  key: number;
  name: string;
  level: PlayerLevel;
}

const levelCycle: PlayerLevel[] = [
  "intermediate",
  "beginner",
  "pro",
  "intermediate",
];

function createPlayer(key: number): PlayerDraft {
  return { key, name: "", level: levelCycle[key % levelCycle.length] };
}

export function CreateSessionForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [name, setName] = useState("Friday Badminton");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("19:00");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [courtCount, setCourtCount] = useState(2);
  const [gameFormat, setGameFormat] = useState<"singles" | "doubles">("doubles");
  const [players, setPlayers] = useState<PlayerDraft[]>(() =>
    Array.from({ length: 8 }, (_, index) => createPlayer(index)),
  );
  const [nextKey, setNextKey] = useState(8);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requiredPlayers = courtCount * (gameFormat === "doubles" ? 4 : 2);
  const completedPlayers = useMemo(
    () => players.filter((player) => player.name.trim().length > 0),
    [players],
  );

  function updatePlayer(key: number, update: Partial<PlayerDraft>) {
    setPlayers((current) =>
      current.map((player) => (player.key === key ? { ...player, ...update } : player)),
    );
  }

  function addPlayer() {
    setPlayers((current) => [...current, createPlayer(nextKey)]);
    setNextKey((current) => current + 1);
  }

  function removePlayer(key: number) {
    setPlayers((current) => current.filter((player) => player.key !== key));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (completedPlayers.length < requiredPlayers) {
      setError(`Add at least ${requiredPlayers} named players to use ${courtCount} courts.`);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          venue,
          scheduledStart: `${date}T${time}:00+07:00`,
          durationMinutes,
          timezone: "Asia/Jakarta",
          courtCount,
          gameFormat,
          players: completedPlayers.map((player) => ({ name: player.name.trim(), level: player.level })),
        }),
      });
      const payload = (await response.json()) as { data?: SessionSnapshot; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not create the session.");

      const recent = JSON.parse(localStorage.getItem("sportround_recent") ?? "[]") as Array<{
        id: string;
        name: string;
        venue: string;
        scheduledStart: string;
      }>;
      const nextRecent = [
        {
          id: payload.data.session.id,
          name: payload.data.session.name,
          venue: payload.data.session.venue,
          scheduledStart: payload.data.session.scheduledStart,
        },
        ...recent.filter((item) => item.id !== payload.data?.session.id),
      ].slice(0, 8);
      localStorage.setItem("sportround_recent", JSON.stringify(nextRecent));
      router.push(`/sessions/${payload.data.session.id}?tab=live&lineup=1`);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Could not create the session.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="session-form" onSubmit={submit}>
      <section className="form-card">
        <div className="form-card-heading"><span>01</span><div><h2>Session details</h2><p>One schedule applies to every court.</p></div></div>
        <div className="form-grid two-columns">
          <label className="field full"><span>Session name</span><input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} /></label>
          <label className="field full"><span>Venue</span><input value={venue} onChange={(event) => setVenue(event.target.value)} placeholder="e.g. SmashPoint Badminton Hall" required maxLength={120} /></label>
          <label className="field"><span>Play date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
          <label className="field"><span>Start time</span><input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label>
          <label className="field"><span>Session duration</span><select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))}>
            <option value={60}>1 hour</option><option value={90}>1.5 hours</option><option value={120}>2 hours</option><option value={150}>2.5 hours</option><option value={180}>3 hours</option><option value={240}>4 hours</option>
          </select></label>
          <label className="field"><span>Number of courts</span><select aria-label="Number of courts" value={courtCount} onChange={(event) => setCourtCount(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((count) => <option value={count} key={count}>{count} {count === 1 ? "court" : "courts"}</option>)}
          </select></label>
        </div>
        <fieldset className="format-field"><legend>Game format</legend><div className="segmented">
          <label className={gameFormat === "doubles" ? "selected" : ""}><input type="radio" name="format" value="doubles" checked={gameFormat === "doubles"} onChange={() => setGameFormat("doubles")} /><strong>Doubles</strong><span>4 players per court</span></label>
          <label className={gameFormat === "singles" ? "selected" : ""}><input type="radio" name="format" value="singles" checked={gameFormat === "singles"} onChange={() => setGameFormat("singles")} /><strong>Singles</strong><span>2 players per court</span></label>
        </div></fieldset>
      </section>

      <section className="form-card">
        <div className="form-card-heading"><span>02</span><div><h2>Players and levels</h2><p>Level helps balance each pair. Rotation is based on games played and rest.</p></div><div className="player-count"><Users size={16} aria-hidden /> {completedPlayers.length}/{requiredPlayers} required</div></div>
        <div className="player-editor" data-testid="player-editor">
          {players.map((player, index) => (
            <div className="player-input-row" key={player.key}>
              <span className="player-number">{String(index + 1).padStart(2, "0")}</span>
              <label className="field"><span className="sr-only">Player {index + 1} name</span><input aria-label={`Player ${index + 1} name`} value={player.name} onChange={(event) => updatePlayer(player.key, { name: event.target.value })} placeholder="Full name" /></label>
              <label className="field level-field"><span className="sr-only">Player {index + 1} level</span><select aria-label={`Player ${index + 1} level`} value={player.level} onChange={(event) => updatePlayer(player.key, { level: event.target.value as PlayerLevel })}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="pro">Pro</option></select></label>
              <button className="icon-button" type="button" aria-label={`Remove player ${index + 1}`} onClick={() => removePlayer(player.key)} disabled={players.length <= 2}><Trash2 size={17} aria-hidden /></button>
            </div>
          ))}
        </div>
        <button className="button secondary compact" type="button" onClick={addPlayer}><Plus size={17} aria-hidden /> Add player</button>
      </section>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <div className="form-submit"><div><strong>Ready to generate Round 1</strong><span>You can review and replace players before starting.</span></div><button className="button primary" type="submit" disabled={submitting}>{submitting ? "Creating session…" : "Create & review lineup"}</button></div>
    </form>
  );
}
