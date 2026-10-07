import { defineConfig } from "@playwright/test";
const external = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: "./e2e",
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: external || "http://localhost:3100",
    browserName: "chromium",
    launchOptions: {
      executablePath: process.env.CHROME_EXECUTABLE || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    trace: "retain-on-failure",
  },
  webServer: external
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3100",
        timeout: 120000,
        reuseExistingServer: false,
        env: { PORT: "3100", STORYMOTION_DATA_DIR: "./data-e2e" },
      },
});
