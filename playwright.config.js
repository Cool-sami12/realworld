const { defineConfig, devices } = require("@playwright/test");

const BACKEND_PORT = 3001;
const FRONTEND_PORT = 5173;

module.exports = defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // One retry in CI absorbs transient runner/network hiccups (not app bugs — a test that fails
  // on every retry still fails the build). Local runs stay at 0 so a real flake is never hidden.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    // Turns failures into inline check annotations on the GitHub Actions run/PR diff.
    ...(process.env.CI ? [["github"]] : []),
  ],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  webServer: [
    {
      command: "node index.js",
      cwd: "backend",
      port: BACKEND_PORT,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `npx vite --port ${FRONTEND_PORT}`,
      cwd: "frontend",
      port: FRONTEND_PORT,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],

  projects: [
    {
      name: "api",
      testDir: "./e2e/api",
      use: { baseURL: `http://localhost:${BACKEND_PORT}/api/` },
    },
    {
      name: "web",
      testDir: "./e2e/web",
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${FRONTEND_PORT}` },
    },
  ],
});
