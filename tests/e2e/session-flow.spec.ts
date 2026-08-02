import { expect, test } from "@playwright/test";

const playerNames = ["Alex", "Bianca", "Chris", "Dina", "Evan", "Farah", "Gilang", "Hana"];

test("host creates a session, viewer records the winner, and everyone sees history", async ({ page, context }, testInfo) => {
  test.setTimeout(60_000);
  const uniqueName = `Friday Badminton ${testInfo.project.name}`;

  await page.goto("/sessions/new", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Session name").fill(uniqueName);
  await page.getByLabel("Venue").fill("Central Smash Hall");
  await page.getByLabel("Number of courts").selectOption("1");
  for (const [index, name] of playerNames.entries()) {
    await page.getByLabel(`Player ${index + 1} name`).fill(name);
  }
  await page.getByRole("button", { name: "Create & review lineup" }).click();

  await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]+/);
  await expect(page.getByRole("heading", { name: "Round 1 lineup" })).toBeVisible();
  await expect(page.getByText("4 players resting")).toBeVisible();
  await page.getByRole("button", { name: "Start Round 1" }).click();
  await expect(page.getByTestId("court-1")).toContainText("LIVE");

  const sessionId = new URL(page.url()).pathname.split("/").filter(Boolean).at(-1)!;
  const shareCode = await page.evaluate(async (id) => {
    const response = await fetch(`/api/sessions/${id}`, { cache: "no-store" });
    const payload = await response.json() as { data: { session: { shareCode: string } } };
    return payload.data.session.shareCode;
  }, sessionId);

  const viewer = await context.newPage();
  await viewer.goto(`/s/${shareCode}`, { waitUntil: "domcontentloaded" });
  await expect(viewer.getByText("SHARED VIEW")).toBeVisible();
  const viewerCourt = viewer.getByTestId("court-1");
  await viewerCourt.getByRole("button", { name: "Update score" }).click();
  await viewer.getByRole("button", { name: "Mark as winner · 21" }).first().click();
  for (let point = 0; point < 7; point += 1) {
    await viewer.getByLabel("Add to Team B").click();
  }
  await viewer.getByRole("button", { name: "Save Score" }).click();

  await expect(viewerCourt.getByText("WINNER")).toBeVisible();
  await expect(viewerCourt).toContainText("21");
  await expect(viewerCourt).toContainText("07");

  await page.bringToFront();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("court-1").getByText("WINNER")).toBeVisible();
  await page.getByRole("button", { name: "Rounds" }).click();
  await page.getByRole("button", { name: /Completed/ }).click();
  const completedCourt = page.getByTestId("court-1");
  await expect(completedCourt.getByText("WINNER")).toBeVisible();
  await expect(completedCourt).toContainText("Final score saved");

  await page.getByRole("button", { name: "Standings" }).click();
  await expect(page.getByText("WIN = 3 PTS")).toBeVisible();
  await expect(page.locator(".standings-row").first()).toContainText("3");

  await page.getByRole("button", { name: "Live" }).click();
  await page.getByRole("button", { name: "Start next game" }).click();
  await expect(page.getByTestId("court-1")).toContainText("LIVE");
  await expect(page.getByText("ROUND 2 LIVE")).toBeVisible();

  const viewportFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(viewportFits).toBe(true);
});
