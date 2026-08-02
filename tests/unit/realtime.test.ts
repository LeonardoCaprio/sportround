import { describe, expect, it } from "vitest";

import { SESSION_FALLBACK_POLL_MS, sessionRealtimeTopic } from "../../src/lib/realtime";

describe("session realtime helpers", () => {
  it("builds a stable channel topic from a share code", () => {
    expect(sessionRealtimeTopic(" fzqwbxaq9m ")).toBe("session:FZQWBXAQ9M");
  });

  it("uses a low-frequency fallback poll", () => {
    expect(SESSION_FALLBACK_POLL_MS).toBe(30_000);
  });
});
