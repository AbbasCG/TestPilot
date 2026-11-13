import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5174",
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "php artisan serve --host=127.0.0.1 --port=8001",
      cwd: "../backend",
      url: "http://127.0.0.1:8001/up",
      reuseExistingServer: false,
      env: {
        DB_DATABASE: "testpilot_e2e",
        SANCTUM_STATEFUL_DOMAINS: "127.0.0.1:5174",
        SESSION_COOKIE: "testpilot_e2e_session",
        // Many specs sign in with the same seeded accounts within a minute.
        LOGIN_ATTEMPTS_PER_MINUTE: "120",
        // Fast CI runs keep two polling runner pages open while specs call the API directly.
        API_REQUESTS_PER_MINUTE: "5000",
        EVIDENCE_UPLOADS_PER_MINUTE: "500",
        INVITATIONS_PER_HOUR: "1000",
        ADMIN_ACTIONS_PER_MINUTE: "1000",
      },
    },
    {
      command: "npm run dev -- --port 5174",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: "http://127.0.0.1:8001" },
    },
  ],
});
