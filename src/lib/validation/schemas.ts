import { z } from "zod";

const playerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  level: z.enum(["beginner", "intermediate", "pro"]),
});

export const createSessionSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    venue: z.string().trim().min(2).max(120),
    scheduledStart: z.iso.datetime({ offset: true }),
    durationMinutes: z.number().int().min(30).max(720),
    timezone: z.string().trim().min(1).max(80).default("Asia/Jakarta"),
    courtCount: z.number().int().min(1).max(12),
    gameFormat: z.enum(["singles", "doubles"]),
    players: z.array(playerSchema).min(2).max(80),
  })
  .superRefine((value, context) => {
    const playersPerMatch = value.gameFormat === "doubles" ? 4 : 2;
    const requiredPlayers = playersPerMatch * value.courtCount;
    if (value.players.length < requiredPlayers) {
      context.addIssue({
        code: "custom",
        path: ["players"],
        message: `${requiredPlayers} players are required for ${value.courtCount} courts.`,
      });
    }

    const names = new Set<string>();
    value.players.forEach((player, index) => {
      const normalized = player.name.toLocaleLowerCase();
      if (names.has(normalized)) {
        context.addIssue({
          code: "custom",
          path: ["players", index, "name"],
          message: "Player names must be unique within a session.",
        });
      }
      names.add(normalized);
    });
  });

export const finalScoreSchema = z
  .object({
    winner: z.enum(["a", "b"]),
    teamAScore: z.number().int().min(0).max(21),
    teamBScore: z.number().int().min(0).max(21),
  })
  .superRefine((value, context) => {
    const winnerScore = value.winner === "a" ? value.teamAScore : value.teamBScore;
    const loserScore = value.winner === "a" ? value.teamBScore : value.teamAScore;
    if (winnerScore !== 21 || loserScore > 20) {
      context.addIssue({
        code: "custom",
        message: "The winner must have 21 points and the loser must have 0–20 points.",
      });
    }
  });

export const swapLineupSchema = z.object({
  assignmentId: z.number().int().positive(),
  replacementPlayerId: z.uuid(),
});

export const substituteSchema = z.object({
  outgoingAssignmentId: z.number().int().positive(),
  replacementPlayerId: z.uuid(),
});

export const emptyActionSchema = z.object({}).strict();
