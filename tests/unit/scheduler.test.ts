import { describe, expect, it } from "vitest";

import { generateLineup } from "@/lib/domain/scheduler";
import { LEVEL_SCORES } from "@/lib/domain/types";

import { completedRound, player } from "./fixtures";

describe("lineup scheduler", () => {
  it("uses every court without duplicating a player", () => {
    const players = Array.from({ length: 12 }, (_, index) => player(`player-${index + 1}`));
    const lineup = generateLineup(players, [], 2, "doubles", "session-seed");
    const assigned = lineup.matches.flatMap((match) => [...match.teamA, ...match.teamB]);

    expect(lineup.matches).toHaveLength(2);
    expect(assigned).toHaveLength(8);
    expect(new Set(assigned).size).toBe(8);
    expect(lineup.waitingPlayerIds).toHaveLength(4);
  });

  it("prioritizes rested players before consecutive players", () => {
    const players = Array.from({ length: 12 }, (_, index) => player(`player-${index + 1}`));
    const previous = completedRound(
      1,
      ["player-1", "player-2", "player-3", "player-4"],
      ["player-5", "player-6", "player-7", "player-8"],
    );
    const lineup = generateLineup(players, [previous], 2, "doubles", "session-seed");
    const assigned = new Set(lineup.matches.flatMap((match) => [...match.teamA, ...match.teamB]));

    for (const restedId of ["player-9", "player-10", "player-11", "player-12"]) {
      expect(assigned.has(restedId)).toBe(true);
    }
  });

  it("treats players on a live court as having a projected game for the next lineup", () => {
    const players = Array.from({ length: 8 }, (_, index) => player(`player-${index + 1}`));
    const liveRound = completedRound(
      1,
      ["player-1", "player-2"],
      ["player-3", "player-4"],
    );
    liveRound.status = "live";
    liveRound.completedAt = null;
    liveRound.matches[0].status = "live";
    liveRound.matches[0].completedAt = null;
    liveRound.matches[0].winner = null;
    liveRound.matches[0].teamAScore = 0;
    liveRound.matches[0].teamBScore = 0;

    const lineup = generateLineup(players, [liveRound], 1, "doubles", "projected-live-game");
    const assigned = new Set(lineup.matches.flatMap((match) => [...match.teamA, ...match.teamB]));

    expect(assigned).toEqual(new Set(["player-5", "player-6", "player-7", "player-8"]));
  });

  it("creates level-balanced doubles teams and is deterministic", () => {
    const players = [
      player("pro-1", "pro"),
      player("pro-2", "pro"),
      player("beginner-1", "beginner"),
      player("beginner-2", "beginner"),
    ];
    const first = generateLineup(players, [], 1, "doubles", "stable-seed");
    const second = generateLineup(players, [], 1, "doubles", "stable-seed");
    const levels = new Map(players.map((item) => [item.id, item.level]));
    const skill = (ids: string[]) => ids.reduce((total, id) => total + LEVEL_SCORES[levels.get(id)!], 0);

    expect(first).toEqual(second);
    expect(skill(first.matches[0].teamA)).toBe(skill(first.matches[0].teamB));
  });
});
