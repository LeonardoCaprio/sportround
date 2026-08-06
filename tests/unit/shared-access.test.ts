import { describe, expect, it } from "vitest";

import { evaluateSharedSessionAccess, sharedSessionExpiresAt } from "@/lib/domain/shared-access";

const scheduledSession = {
  scheduledStart: "2026-08-04T10:00:00.000Z",
  durationMinutes: 120,
  status: "live" as const,
};

describe("shared session access", () => {
  it("expires exactly when the scheduled duration finishes", () => {
    expect(sharedSessionExpiresAt(scheduledSession)).toBe("2026-08-04T12:00:00.000Z");
    expect(evaluateSharedSessionAccess(scheduledSession, Date.parse("2026-08-04T11:59:59.999Z"))).toEqual({
      available: true,
      expiresAt: "2026-08-04T12:00:00.000Z",
    });
    expect(evaluateSharedSessionAccess(scheduledSession, Date.parse("2026-08-04T12:00:00.000Z"))).toEqual({
      available: false,
      expiresAt: "2026-08-04T12:00:00.000Z",
      reason: "expired",
    });
  });

  it("closes shared access immediately when the host ends the session", () => {
    expect(evaluateSharedSessionAccess(
      { ...scheduledSession, status: "ended" },
      Date.parse("2026-08-04T10:30:00.000Z"),
    )).toEqual({
      available: false,
      expiresAt: "2026-08-04T12:00:00.000Z",
      reason: "ended",
    });
  });
});
