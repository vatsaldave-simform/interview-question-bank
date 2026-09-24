import { defineConfig, devices } from "@playwright/test";
import { apiPort } from "./stack.ts";

export default defineConfig({
  testDir: "tests",
  globalSetup: "./global-setup.ts",
  // One stack and one seeded bank, so tests running side by side would see each other's writes.
  workers: 1,
  forbidOnly: process.env.CI !== undefined,
  use: {
    baseURL: `http://localhost:${apiPort}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
