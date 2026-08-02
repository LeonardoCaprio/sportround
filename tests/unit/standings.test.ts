import { describe, expect, it } from "vitest";

import { calculateStandings } from "@/lib/domain/standings";

import { completedRound, player } from "./fixtures";

describe("leaderboard standings", () => {
  it("awards three points per win and orders by point difference", () => {
    const players = [player("Alex"), player("Bianca"), player("Chris"), player("Dina")];
    const rounds = [
      completedRound(1, ["Alex", "Bianca"], ["Chris", "Dina"], 21, 18),
      completedRound(2, ["Chris", "Dina"], ["Alex", "Bianca"], 21, 10),
    ];
    const standings = calculateStandings(players, rounds);

    expect(standings.map((row) => row.leaderboardPoints)).toEqual([3, 3, 3, 3]);
    expect(standings[0].name).toBe("Chris");
    expect(standings[0]).toMatchObject({ gamesPlayed: 2, wins: 1, losses: 1, pointDifference: 8 });
    expect(standings.at(-1)).toMatchObject({ name: "Bianca", pointDifference: -8 });
  });

  it("shows live and planned court status without counting unfinished games", () => {
    const players = [player("Alex"), player("Bianca"), player("Chris"), player("Dina")];
    const live = completedRound(1, ["Alex", "Bianca"], ["Chris", "Dina"]);
    live.status = "live";
    live.matches[0].status = "live";
    live.matches[0].winner = null;
    const standings = calculateStandings(players, [live]);

    expect(standings.every((row) => row.gamesPlayed === 0)).toBe(true);
    expect(standings.every((row) => row.status === "playing" && row.currentCourt === 1)).toBe(true);
  });
});
