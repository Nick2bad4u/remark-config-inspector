import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const serverPort = Number(process.env.REMARK_INSPECTOR_TEST_PORT ?? "4173");
if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535)
    throw new Error("REMARK_INSPECTOR_TEST_PORT must be a valid TCP port.");
const baseURL = `http://127.0.0.1:${serverPort}`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: "./tests/e2e",
    outputDir: "./output/playwright/test-results",
    testIgnore: ["**/fixtures/**"],
    forbidOnly: isCI,
    timeout: 45_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: false,
    retries: isCI ? 2 : 0,
    workers: isCI ? 1 : undefined,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL,
        actionTimeout: 10_000,
        navigationTimeout: 20_000,
        screenshot: "only-on-failure",
        trace: "on-first-retry",
        video: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
        ...(isCI
            ? [
                  {
                      name: "firefox",
                      use: { ...devices["Desktop Firefox"] },
                  },
              ]
            : []),
    ],
    webServer: {
        command: `node scripts/serve-static-dist.mjs --host 127.0.0.1 --port ${serverPort} --dir dist/public`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
    },
});
