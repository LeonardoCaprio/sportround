import { expect, test } from "@playwright/test";

const playerNames = ["Alex", "Bianca", "Chris", "Dina", "Evan", "Farah", "Gilang", "Hana"];

async function expectCourtReadingOrder(
  court: import("@playwright/test").Locator,
  viewportWidth: number,
) {
  const centers = await court.evaluate((element) => {
    const center = (selector: string) => {
      const node = element.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`Missing court element: ${selector}`);
      const box = node.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };

    return {
      teamAPlayers: center(".court-player-zone.team-a"),
      teamAScore: center(".court-score-cell.team-a"),
      teamBScore: center(".court-score-cell.team-b"),
      teamBPlayers: center(".court-player-zone.team-b"),
    };
  });

  if (viewportWidth < 820) {
    expect(centers.teamAPlayers.y).toBeLessThan(centers.teamAScore.y);
    expect(centers.teamAScore.y).toBeLessThan(centers.teamBScore.y);
    expect(centers.teamBScore.y).toBeLessThan(centers.teamBPlayers.y);
  } else {
    expect(centers.teamAPlayers.x).toBeLessThan(centers.teamAScore.x);
    expect(centers.teamAScore.x).toBeLessThan(centers.teamBScore.x);
    expect(centers.teamBScore.x).toBeLessThan(centers.teamBPlayers.x);
    const verticalCenters = [centers.teamAPlayers.y, centers.teamAScore.y, centers.teamBScore.y, centers.teamBPlayers.y];
    expect(Math.max(...verticalCenters) - Math.min(...verticalCenters)).toBeLessThan(2);
  }
}

test("host manages a session while the shared link stays view-only", async ({ page, context }, testInfo) => {
  test.setTimeout(60_000);
  const uniqueName = `Friday Badminton ${testInfo.project.name}`;

  await page.goto("/sessions/new", { waitUntil: "networkidle" });
  await page.getByLabel("Session name").fill(uniqueName);
  await page.getByLabel("Venue").fill("Central Smash Hall");
  await page.getByLabel("Play date").fill("2099-01-01");
  await page.getByLabel("Number of courts").selectOption("1");
  for (const [index, name] of playerNames.entries()) {
    await page.getByLabel(`Player ${index + 1} name`).fill(name);
  }
  await page.getByRole("button", { name: "Create & review lineup" }).click();

  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: "Round 1 lineup" })).toBeVisible();
  await expect(page.getByText("4 players resting")).toBeVisible();
  await page.getByRole("button", { name: "Replace" }).first().click();
  await expect(page.getByRole("heading", { name: "Replace a Court 1 player" })).toBeVisible();
  await page.getByRole("button", { name: "Shuffle player" }).click();
  await expect(page.locator(".replacement-suggestion.has-suggestion")).toBeVisible();
  await page.getByRole("button", { name: "Confirm replacement" }).click();
  await expect(page.getByText("The planned lineup has been updated.")).toBeVisible();
  await page.getByRole("button", { name: "Start Round 1" }).click();
  await expect(page.getByTestId("court-1")).toContainText("LIVE");
  await expectCourtReadingOrder(page.getByTestId("court-1"), page.viewportSize()!.width);
  await page.getByRole("button", { name: "Prepare next lineup" }).click();
  await expect(page.getByRole("heading", { name: "Round 2 lineup" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Waiting for current round" })).toBeDisabled();
  await page.getByRole("button", { name: "Close review" }).click();
  await expect(page.getByText("Lineup prepared · start unlocks", { exact: false })).toBeVisible();

  const sessionId = new URL(page.url()).pathname.split("/").filter(Boolean).at(-1)!;
  const sessionAccess = await page.evaluate(async (id) => {
    const response = await fetch(`/api/sessions/${id}`, { cache: "no-store" });
    const payload = await response.json() as { data: { session: { shareCode: string }; rounds: Array<{ matches: Array<{ id: string }> }> } };
    return {
      shareCode: payload.data.session.shareCode,
      matchId: payload.data.rounds.flatMap((round) => round.matches)[0].id,
    };
  }, sessionId);

  const viewer = await context.newPage();
  await viewer.goto(`/s/${sessionAccess.shareCode}`, { waitUntil: "domcontentloaded" });
  await expect(viewer.getByText("VIEW ONLY", { exact: true })).toBeVisible();
  const viewerCourt = viewer.getByTestId("court-1");
  await expect(viewerCourt.getByRole("button", { name: "Update score" })).toHaveCount(0);
  await expect(viewerCourt.getByRole("button", { name: "Replace player" })).toHaveCount(0);
  await expect(viewer.getByText("Round 2", { exact: true })).toBeVisible();
  const blockedPostStatus = await viewer.evaluate(async ({ shareCode, matchId }) => {
    const response = await fetch(`/api/share/${shareCode}/matches/${matchId}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ winner: "a", teamAScore: 21, teamBScore: 7 }),
    });
    return response.status;
  }, sessionAccess);
  expect([404, 405]).toContain(blockedPostStatus);

  await page.bringToFront();
  const hostCourt = page.getByTestId("court-1");
  await hostCourt.getByRole("button", { name: "Update score" }).click();
  await page.getByRole("button", { name: "Mark as winner · 21" }).first().click();
  for (let point = 0; point < 7; point += 1) {
    await page.getByLabel("Add to Team B").click();
  }
  await page.getByRole("button", { name: "Save Score" }).click();

  await viewer.bringToFront();
  await viewer.reload({ waitUntil: "domcontentloaded" });
  await expect(viewerCourt.getByText("WINNER")).toBeVisible();
  await expect(viewerCourt).toContainText("21");
  await expect(viewerCourt).toContainText("07");

  await page.bringToFront();
  await expect(page.getByTestId("court-1").getByText("WINNER")).toBeVisible();
  await page.getByRole("button", { name: "Rounds" }).click();
  await page.getByRole("button", { name: /Completed/ }).click();
  const completedCourt = page.getByTestId("court-1");
  await expect(completedCourt.getByText("WINNER")).toBeVisible();
  await expect(completedCourt).toContainText("Final score saved");

  await page.getByRole("button", { name: "Standings" }).click();
  await expect(page.getByText("WIN = 3 PTS")).toBeVisible();
  await expect(page.locator(".standings-row").first()).toContainText("3");
  await page.getByRole("button", { name: "Screenshot view" }).click();
  await expect(page.locator(".standings-capture-header")).toContainText(uniqueName);
  await expect(page.locator(".standings-row")).toHaveCount(playerNames.length);
  await page.getByRole("button", { name: "Exit screenshot view" }).click();

  await page.getByRole("button", { name: "Live" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByText("SESSION ENDED", { exact: true })).toBeVisible();

  await viewer.bringToFront();
  await viewer.reload({ waitUntil: "domcontentloaded" });
  await expect(viewer.getByRole("heading", { name: "This session has ended" })).toBeVisible();
  await expect(viewer.getByText("round history are no longer available", { exact: false })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Live" })).toHaveCount(0);

  await page.bringToFront();
  const viewportFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(viewportFits).toBe(true);
});

test("shared access expires after the scheduled duration while host access remains", async ({ request }) => {
  const scheduledStart = new Date(Date.now() - 31 * 60_000).toISOString();
  const response = await request.post("/api/sessions", {
    data: {
      name: "Expired Shared Session",
      venue: "Security Test Hall",
      scheduledStart,
      durationMinutes: 30,
      timezone: "Asia/Jakarta",
      courtCount: 1,
      gameFormat: "doubles",
      players: playerNames.slice(0, 4).map((name) => ({ name, level: "intermediate" })),
    },
  });
  expect(response.status()).toBe(201);
  const payload = await response.json() as { data: { session: { id: string; shareCode: string } } };

  const sharedResponse = await request.get(`/api/share/${payload.data.session.shareCode}`);
  expect(sharedResponse.status()).toBe(410);
  await expect(sharedResponse.json()).resolves.toMatchObject({
    details: { reason: "expired" },
  });

  const hostResponse = await request.get(`/api/sessions/${payload.data.session.id}`);
  expect(hostResponse.status()).toBe(200);
});

test("singles court keeps the requested player-score reading order", async ({ page }, testInfo) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const sessionId = await page.evaluate(async ({ name, players }) => {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        venue: "Singles Layout Hall",
        scheduledStart: "2099-01-01T12:00:00.000Z",
        durationMinutes: 120,
        timezone: "Asia/Jakarta",
        courtCount: 1,
        gameFormat: "singles",
        players: players.map((playerName, index) => ({
          name: playerName,
          level: index === 0 ? "pro" : index === 1 ? "beginner" : "intermediate",
        })),
      }),
    });
    const payload = await response.json() as { data?: { session: { id: string } }; error?: string };
    if (!response.ok || !payload.data) throw new Error(payload.error ?? "Session creation failed");
    const startResponse = await fetch(`/api/sessions/${payload.data.session.id}/rounds/start`, {
      method: "POST",
    });
    if (!startResponse.ok) throw new Error("Round start failed");
    return payload.data.session.id;
  }, {
    name: `Singles layout ${testInfo.project.name}`,
    players: playerNames.slice(0, 4),
  });

  await page.goto(`/sessions/${sessionId}`, { waitUntil: "domcontentloaded" });
  const court = page.getByTestId("court-1");
  await expect(court).toContainText("LIVE");
  await expect(court.locator(".court-player-zone.singles")).toHaveCount(2);
  await expectCourtReadingOrder(court, page.viewportSize()!.width);
});
