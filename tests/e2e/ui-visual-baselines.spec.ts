import process from "node:process";
import { expect, test } from "@playwright/test";
import { MOCK_PAYLOAD, mockPayload } from "./fixtures/mock-payload";
import { STATS_REPORT } from "./fixtures/stats";

test.use({ locale: "en-US", timezoneId: "UTC" });

// Pixel baselines are environment-specific. The cross-platform layout and
// interaction matrix is in ui-consistency.spec.ts and runs independently.
for (const theme of ["light", "dark"] as const) {
    for (const route of [
        "configs",
        "stats",
        "rules",
    ] as const) {
        test(`${route} ${theme} visual baseline`, async ({
            page,
        }, testInfo) => {
            test.skip(
                process.platform !== "win32" ||
                    testInfo.project.name !== "chromium",
                "Reviewed pixel baselines target Windows Chromium."
            );
            await page.clock.setFixedTime(STATS_REPORT.createdAt);
            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.emulateMedia({
                colorScheme: theme,
                reducedMotion: "reduce",
            });
            await page.addInitScript((value) => {
                localStorage.clear();
                localStorage.setItem("vueuse-color-scheme", value);
                localStorage.setItem(
                    "stateStorage",
                    JSON.stringify({ theme: value, fontScale: "md" })
                );
            }, theme);
            await mockPayload(page, {
                ...MOCK_PAYLOAD,
                meta: {
                    ...MOCK_PAYLOAD.meta,
                    lastUpdate: STATS_REPORT.createdAt,
                },
                stats: STATS_REPORT,
            });
            await page.goto(`/${route}`);
            await expect(
                page.getByText("Remark Config Inspector", { exact: true })
            ).toBeVisible();
            await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
            await expect(page).toHaveScreenshot(`${route}-${theme}.png`, {
                fullPage: true,
                animations: "disabled",
                // A release version change should not invalidate UI baselines.
                mask: [page.getByRole("link", { name: /^v\d+\.\d+\.\d+$/ })],
                maskColor: theme === "light" ? "#f7f8fa" : "#151619",
            });
        });
    }
}

for (const theme of ["light", "dark"] as const) {
    for (const viewport of [
        { name: "desktop", width: 1440, height: 1000 },
        { name: "mobile", width: 390, height: 844 },
    ]) {
        test(`rule states ${theme} ${viewport.name} visual baseline`, async ({
            page,
        }, testInfo) => {
            test.skip(
                process.platform !== "win32" ||
                    testInfo.project.name !== "chromium",
                "Reviewed pixel baselines target Windows Chromium."
            );
            await page.clock.setFixedTime(STATS_REPORT.createdAt);
            await page.setViewportSize(viewport);
            await page.emulateMedia({
                colorScheme: theme,
                reducedMotion: "reduce",
            });
            await page.addInitScript((value) => {
                localStorage.clear();
                localStorage.setItem("vueuse-color-scheme", value);
                localStorage.setItem(
                    "stateStorage",
                    JSON.stringify({
                        theme: value,
                        fontScale: "lg",
                        filtersRules: { state: "" },
                    })
                );
            }, theme);
            const payload = structuredClone(MOCK_PAYLOAD);
            payload.meta.lastUpdate = STATS_REPORT.createdAt;
            payload.configs[0]!.rules!["remark-lint-no-dead-urls"] = false;
            for (let index = 0; index < 4; index++) {
                payload.configs.push({
                    index: payload.configs.length,
                    name: `remark/override-${index}`,
                    rules: { "remark-lint-final-newline": true },
                });
            }
            await mockPayload(page, payload);
            await page.goto("/rules");
            await expect(page.getByTestId("rule-state-overflow")).toHaveText(
                "+3"
            );
            await expect(page.locator(".rule-muted-off").first()).toBeVisible();
            await expect(page).toHaveScreenshot(
                `rule-states-${theme}-${viewport.name}.png`,
                {
                    fullPage: true,
                    animations: "disabled",
                    mask: [
                        page.getByRole("link", { name: /^v\d+\.\d+\.\d+$/ }),
                    ],
                    maskColor: theme === "light" ? "#f7f8fa" : "#151619",
                }
            );
        });
    }
}
