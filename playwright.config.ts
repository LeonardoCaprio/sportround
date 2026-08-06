import { defineConfig, devices } from "@playwright/test";

const testPort = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run dev -- --webpack --hostname 127.0.0.1 --port ${testPort}`,
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATA_BACKEND: "memory",
      NEXT_DIST_DIR: ".next-e2e",
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${testPort}`,
      NEXT_PUBLIC_SUPABASE_REALTIME_ENABLED: "false",
    },
  },
});
