import { describe, expect, it } from "vitest";

import { assertValidFinalScore, buildFinalScore } from "@/lib/domain/scoring";
import { finalScoreSchema } from "@/lib/validation/schemas";

describe("final score rules", () => {
  it("marks the selected winner at 21", () => {
    expect(buildFinalScore("a", 17)).toEqual({ teamAScore: 21, teamBScore: 17, winner: "a" });
    expect(buildFinalScore("b", 9)).toEqual({ teamAScore: 9, teamBScore: 21, winner: "b" });
  });

  it("rejects a losing score outside 0–20", () => {
    expect(() => buildFinalScore("a", 21)).toThrow(/0 to 20/);
    expect(() => buildFinalScore("b", -1)).toThrow(/0 to 20/);
  });

  it("rejects inconsistent API payloads", () => {
    expect(() => assertValidFinalScore({ winner: "a", teamAScore: 20, teamBScore: 10 })).toThrow(/21/);
    expect(finalScoreSchema.safeParse({ winner: "b", teamAScore: 21, teamBScore: 21 }).success).toBe(false);
  });
});
