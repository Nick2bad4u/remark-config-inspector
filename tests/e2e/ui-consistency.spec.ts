import { mkdir } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { MOCK_PAYLOAD, mockPayload } from "./fixtures/mock-payload";
import { STATS_REPORT } from "./fixtures/stats";

test.use({ locale: "en-US", timezoneId: "UTC" });

const routes = [
    "configs",
    "rules",
    "extends",
    "files",
    "stats",
    "dev",
] as const;
const viewports = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
] as const;

test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(STATS_REPORT.createdAt);
    await mockPayload(page, {
        ...MOCK_PAYLOAD,
        meta: { ...MOCK_PAYLOAD.meta, lastUpdate: STATS_REPORT.createdAt },
        stats: STATS_REPORT,
    });
});

for (const theme of ["light", "dark"] as const) {
    for (const viewport of viewports) {
        for (const route of routes) {
            test(`${route}: ${theme} ${viewport.name} remains usable`, async ({
                page,
            }, testInfo) => {
                test.skip(
                    testInfo.project.name !== "chromium",
                    "Visual matrix uses Chromium; Firefox retains functional coverage."
                );
                const errors: string[] = [];
                page.on("pageerror", (error) => errors.push(error.message));
                page.on("console", (message) => {
                    if (message.type() === "error") errors.push(message.text());
                });
                await page.setViewportSize({
                    width: viewport.width,
                    height: viewport.height,
                });
                await page.emulateMedia({
                    colorScheme: theme,
                    reducedMotion: "reduce",
                });
                await page.addInitScript((selectedTheme) => {
                    localStorage.clear();
                    localStorage.setItem("vueuse-color-scheme", selectedTheme);
                    localStorage.setItem(
                        "stateStorage",
                        JSON.stringify({
                            theme: selectedTheme,
                            fontScale: "md",
                        })
                    );
                }, theme);
                await page.goto(`/${route}`);
                await expect(
                    page.getByText("Remark Config Inspector", { exact: true })
                ).toBeVisible();
                await expect(
                    page.getByRole("navigation", { name: "Inspector sections" })
                ).toBeVisible();
                await expect(
                    page.getByRole("heading", { level: 1 })
                ).toBeVisible();
                await page.evaluate(async () => {
                    await document.fonts.ready;
                });
                await expect
                    .poll(() =>
                        page.evaluate(
                            () => document.documentElement.scrollWidth
                        )
                    )
                    .toBeLessThanOrEqual(viewport.width);
                expect(errors).toEqual([]);
                await mkdir("output/playwright", { recursive: true });
                await page.screenshot({
                    path: `output/playwright/${route}-${theme}-${viewport.name}.png`,
                    fullPage: true,
                    animations: "disabled",
                });
            });
        }
    }
}

test("large text and keyboard navigation work across all tabs", async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
        localStorage.setItem(
            "stateStorage",
            JSON.stringify({ theme: "light", fontScale: "lg" })
        );
        localStorage.setItem("vueuse-color-scheme", "light");
    });
    await page.goto("/configs");
    const navigation = page.getByRole("navigation", {
        name: "Inspector sections",
    });
    for (const route of routes) {
        const link = navigation.locator(`a[href$="/${route}"]`);
        await link.focus();
        await expect(link).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(new RegExp(`/${route}$`));
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth)
            )
            .toBeLessThanOrEqual(390);
    }
    await page.reload();
    expect(
        await page.evaluate(
            () =>
                JSON.parse(localStorage.getItem("stateStorage") ?? "{}")
                    .fontScale
        )
    ).toBe("lg");
});

test("each font preference changes interface text and persists after reload", async ({
    page,
}) => {
    await page.goto("/stats");
    await expect(
        page.getByText("Remark Config Inspector", { exact: true })
    ).toBeVisible();
    const sizes = [
        { label: "Small", value: "sm", pixels: 15 },
        { label: "Default", value: "md", pixels: 16 },
        { label: "Large", value: "lg", pixels: 18 },
    ] as const;
    for (const size of sizes) {
        await page.getByRole("button", { name: /^Font size:/ }).click();
        const option = page.getByRole("button", {
            name: new RegExp(`^${size.label} `),
        });
        await option.click();
        await expect(option).toHaveAttribute("aria-pressed", "true");
        await expect
            .poll(() =>
                page.evaluate(
                    () => getComputedStyle(document.documentElement).fontSize
                )
            )
            .toBe(`${size.pixels}px`);
        await expect
            .poll(() =>
                page
                    .getByTestId("nav-link-stats")
                    .evaluate((element) =>
                        Number.parseFloat(getComputedStyle(element).fontSize)
                    )
            )
            .toBeCloseTo(size.pixels);
        await page.reload();
        await expect(
            page.getByRole("button", {
                name: `Font size: ${size.label}`,
                exact: true,
            })
        ).toBeVisible();
        await expect
            .poll(() =>
                page.evaluate(
                    () => getComputedStyle(document.documentElement).fontSize
                )
            )
            .toBe(`${size.pixels}px`);
        expect(
            await page.evaluate(
                () =>
                    JSON.parse(localStorage.getItem("stateStorage") ?? "{}")
                        .fontScale
            )
        ).toBe(size.value);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const route of routes) {
        await page.getByTestId(`nav-link-${route}`).click();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect
            .poll(() =>
                page.evaluate(() => document.documentElement.scrollWidth)
            )
            .toBeLessThanOrEqual(1440);
    }
});

test("keyboard closes font settings and restores trigger focus", async ({
    page,
}) => {
    await page.goto("/rules");
    await expect(
        page.getByText("Remark Config Inspector", { exact: true })
    ).toBeVisible();
    const fontTrigger = page.getByRole("button", { name: /^Font size:/ });
    await fontTrigger.focus();
    await page.keyboard.press("Enter");
    const largeOption = page.getByRole("button", { name: /^Large / });
    await expect(largeOption).toBeVisible();
    await largeOption.focus();
    await page.keyboard.press("Escape");
    await expect(largeOption).not.toBeVisible();
    await expect(fontTrigger).toBeFocused();
});

test("keyboard closes rule details and restores trigger focus", async ({
    page,
}) => {
    await page.goto("/rules");
    await expect(
        page.getByText("Remark Config Inspector", { exact: true })
    ).toBeVisible();
    const ruleTrigger = page
        .locator(
            'button.colorized-rule-name[title="remark-lint-final-newline"]'
        )
        .first();
    await ruleTrigger.focus();
    await page.keyboard.press("Enter");
    const popup = page
        .locator(".v-popper--theme-dropdown .v-popper__inner")
        .filter({ hasText: "Copy name" })
        .first();
    await expect(popup).toBeVisible();
    await popup.getByRole("button", { name: "Copy name", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(popup).not.toBeVisible();
    await expect(ruleTrigger).toBeFocused();
});

test("long names and paths with many plugin filters stay usable on mobile", async ({
    page,
}) => {
    const payload = structuredClone(MOCK_PAYLOAD);
    const longPath = `docs/${"deeply-nested-markdown-folder/".repeat(8)}guide.md`;
    payload.meta.targetFilePath = longPath;
    payload.meta.configPath = `${"team-configuration/".repeat(8)}.remarkrc.mjs`;
    const names = Array.from(
        { length: 12 },
        (_, index) =>
            `remark-lint-team-${index}-${"descriptive-convention-".repeat(4)}links`
    );
    payload.rules = Object.fromEntries(
        names.map((name) => [
            name,
            {
                name,
                plugin: name,
                pluginPackageName: name,
                docs: {
                    description: "A project-specific Markdown convention.",
                },
            },
        ])
    );
    payload.configs = [
        {
            index: 0,
            name: "Team conventions",
            rules: Object.fromEntries(names.map((name) => [name, true])),
            plugins: Object.fromEntries(names.map((name) => [name, {}])),
        },
    ];
    payload.files = [{ filepath: longPath, configs: [0], globs: ["**/*.md"] }];
    await mockPayload(page, payload);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/rules");
    await expect(
        page.getByText("Remark Config Inspector", { exact: true })
    ).toBeVisible();
    await page.getByRole("button", { name: /show plugin filters/i }).click();
    const chips = page.locator(".plugin-filter-button");
    await expect(chips).toHaveCount(13);
    for (const chip of await chips.all()) {
        await chip.scrollIntoViewIfNeeded();
        const box = await chip.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(390);
    await chips.filter({ hasText: names[0] }).click();
    await expect(page.locator(".colorized-rule-name")).toHaveCount(1);
    await page.getByTestId("nav-link-files").click();
    await expect(
        page.getByText(longPath, { exact: true }).last()
    ).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(390);
});

test("payload loading and configuration errors remain recoverable", async ({
    page,
}) => {
    let releaseResponse: (() => void) | undefined;
    const responseGate = new Promise<void>((resolve) => {
        releaseResponse = resolve;
    });
    let attempts = 0;
    await page.route("**/api/payload.json**", async (route) => {
        attempts++;
        if (attempts === 1) {
            await responseGate;
            await route.fulfill({
                json: {
                    error: "Cannot load project plugin",
                    message: "Check the project configuration and retry.",
                },
            });
        } else {
            await route.fulfill({ json: MOCK_PAYLOAD });
        }
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/configs");
    await expect(
        page.getByText("Loading config...", { exact: true })
    ).toBeVisible();
    releaseResponse?.();
    await expect(
        page.getByText("Cannot load project plugin", { exact: true })
    ).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(390);
    await page
        .getByRole("button", { name: "Retry payload", exact: true })
        .click();
    await expect(
        page.getByText("Remark Config Inspector", { exact: true })
    ).toBeVisible();
    await expect(
        page.getByRole("heading", { level: 1, name: "Configs" })
    ).toBeVisible();
    expect(attempts).toBe(2);
});
