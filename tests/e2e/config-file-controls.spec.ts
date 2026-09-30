import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
    MOCK_PAYLOAD,
    mockPayload,
    pluginRuleName,
} from "./fixtures/mock-payload";

const filepath = "docs/example.md";
const newlineRule = "remark-lint-final-newline";
const lengthRule = "remark-lint-maximum-line-length";

async function openConfigs(page: Page): Promise<void> {
    await mockPayload(page);
    await page.goto("/configs");
    await expect(page.getByRole("combobox")).toBeVisible();
}

test("matched and merged controls keep their selected mode and show the correct rule groups", async ({
    page,
}) => {
    const payload = structuredClone(MOCK_PAYLOAD);
    payload.configs[1]!.rules = {
        [newlineRule]: false,
        [lengthRule]: 80,
    };
    await mockPayload(page, payload);
    await page.goto("/configs");
    await page.getByRole("combobox").fill(filepath);
    const matched = page.getByRole("button", {
        name: "Matched Config Items",
        exact: true,
    });
    const merged = page.getByRole("button", {
        name: "Merged Rules",
        exact: true,
    });
    await matched.click();
    await expect(matched).toHaveAttribute("aria-pressed", "true");
    await matched.click();
    await expect(matched).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("details.flat-config-item:visible")).toHaveCount(
        2
    );

    await merged.click();
    await expect(merged).toHaveAttribute("aria-pressed", "true");
    await merged.click();
    await expect(merged).toHaveAttribute("aria-pressed", "true");
    const common = page.locator("details.flat-config-item").filter({
        has: page.locator("summary", { hasText: "Common to every file" }),
    });
    const specific = page.locator("details.flat-config-item").filter({
        has: page.locator("summary", {
            hasText: "Specific to matched file",
        }),
    });
    await common.locator("summary").click();
    await expect(
        common.locator(`button.colorized-rule-name[title="${pluginRuleName}"]`)
    ).toBeVisible();
    await expect(
        common.locator(`button.colorized-rule-name[title="${newlineRule}"]`)
    ).toBeVisible();
    await expect(
        specific.getByText("Disables (1)", { exact: true })
    ).toBeVisible();
    await expect(
        specific.locator(`button.colorized-rule-name[title="${newlineRule}"]`)
    ).toBeVisible();
    await expect(
        specific.locator(`button.colorized-rule-name[title="${lengthRule}"]`)
    ).toBeVisible();
    await expect(
        specific.locator(
            `button.colorized-rule-name[title="${pluginRuleName}"]`
        )
    ).toHaveCount(0);
});

test("filepath autocomplete supports arrow selection, Enter confirmation, and Escape dismissal", async ({
    page,
}) => {
    await openConfigs(page);
    const input = page.getByRole("combobox");
    const options = page.getByRole("option");
    await input.fill("docs/");
    await expect(options).toHaveCount(2);
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await input.press("ArrowDown");
    await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(input).toHaveAttribute(
        "aria-activedescendant",
        (await options.nth(1).getAttribute("id"))!
    );
    await input.press("ArrowUp");
    await expect(options.first()).toHaveAttribute("aria-selected", "true");
    const selectedPath = (await options.first().textContent())!.trim();
    await input.press("Enter");
    await expect(input).toHaveValue(selectedPath);
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("listbox")).not.toBeVisible();

    await input.fill("docs/");
    await input.click();
    await expect(options).toHaveCount(2);
    await input.press("Escape");
    await expect(input).toHaveValue("docs/");
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await expect(input).not.toHaveAttribute("aria-activedescendant");
});

test("a config rule popup applies a rule filter and clearing it restores all config items", async ({
    page,
}) => {
    await openConfigs(page);
    await page
        .locator(`button.colorized-rule-name[title="${newlineRule}"]`)
        .click();
    await page
        .getByRole("button", { name: "Filter by this rule", exact: true })
        .click();
    await expect(page.locator("details.flat-config-item:visible")).toHaveCount(
        1
    );
    await expect(
        page.locator(
            "details.flat-config-item:visible button.colorized-rule-name"
        )
    ).toHaveCount(1);
    const clearRule = page.getByRole("button", {
        name: "Clear rule filter",
        exact: true,
    });
    await expect(clearRule).toBeVisible();
    await clearRule.click();
    await expect(clearRule).toHaveCount(0);
    await expect(page.locator("details.flat-config-item:visible")).toHaveCount(
        3
    );
    await expect(
        page.locator(
            "details.flat-config-item:visible button.colorized-rule-name"
        )
    ).toHaveCount(4);
});

test("summary shortcuts open their config and reveal additional options and ignore patterns", async ({
    page,
}) => {
    const payload = structuredClone(MOCK_PAYLOAD);
    payload.configs[0]!.settings = { bullet: "*" };
    payload.meta.ignoreFile = {
        path: ".remarkignore",
        patterns: ["generated/**"],
    };
    await mockPayload(page, payload);
    await page.goto("/configs");
    const root = page.locator('[data-config-item-index="0"]');
    await page
        .getByRole("button", { name: "Collapse All", exact: true })
        .click();
    await expect(root).not.toHaveAttribute("open");
    await root
        .getByTestId("config-summary-item")
        .filter({ has: page.locator(".i-ph-sliders-duotone") })
        .click();
    await expect(root).toHaveAttribute("open");
    const disclosure = root.getByRole("button", {
        name: "Additional configurations (1)",
        exact: true,
    });
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");
    await expect(
        root.locator(".shiki").filter({ hasText: "bullet" })
    ).toBeVisible();
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await expect(
        root.locator(".shiki").filter({ hasText: "bullet" })
    ).toHaveCount(0);
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "true");

    await page
        .getByRole("button", { name: "Collapse All", exact: true })
        .click();
    await root
        .getByTestId("config-summary-item")
        .filter({ has: page.locator(".i-ph-file-x-duotone") })
        .click();
    await expect(root).toHaveAttribute("open");
    const ignoreDetails = root
        .locator("details")
        .filter({ has: page.locator("summary", { hasText: ".remarkignore" }) });
    await expect(ignoreDetails).toHaveAttribute("open");
    await expect(
        ignoreDetails.getByText("generated/**", { exact: true })
    ).toBeVisible();
    await ignoreDetails.locator("summary").click();
    await expect(ignoreDetails).not.toHaveAttribute("open");
});

test("opening a filename clears stale rule and plugin filters while preserving its matching configs", async ({
    page,
}) => {
    await page.addInitScript(() => {
        localStorage.setItem(
            "stateStorage",
            JSON.stringify({
                viewFileMatchType: "configs",
                viewFilesTab: "list",
                filtersConfigs: {
                    filepath: "stale.mdx",
                    rule: "remark-lint-no-undefined-references",
                    plugins: ["remark-lint-no-undefined-references"],
                },
            })
        );
    });
    await mockPayload(page);
    await page.goto("/files");
    await page.getByRole("button", { name: filepath, exact: true }).click();
    await expect(page).toHaveURL(/\/configs$/);
    await expect(page.getByRole("combobox")).toHaveValue(filepath);
    await expect(
        page.getByRole("button", { name: "Clear rule filter", exact: true })
    ).toHaveCount(0);
    await expect(
        page.getByRole("button", { name: "Clear plugin filter", exact: true })
    ).toHaveCount(0);
    await expect(page.locator("details.flat-config-item:visible")).toHaveCount(
        2
    );
    await expect(
        page.locator(`button.colorized-rule-name[title="${lengthRule}"]`)
    ).toBeVisible();
    await expect(
        page.locator(`button.colorized-rule-name[title="${pluginRuleName}"]`)
    ).toBeVisible();
});

test("file group config details navigate to and expand the chosen config", async ({
    page,
}) => {
    await mockPayload(page);
    await page.goto("/files");
    await page.getByTestId("files-view-groups-button").click();
    await page
        .getByRole("button", { name: /remark\/override-1/ })
        .first()
        .click();
    await page
        .getByRole("button", { name: "Go to this config", exact: true })
        .click();
    await expect(page).toHaveURL(/\/configs\?index=2$/);
    await expect(page.locator('[data-config-item-index="1"]')).toHaveAttribute(
        "open"
    );
    await expect(
        page.locator('[data-config-item-index="0"]')
    ).not.toHaveAttribute("open");
    await expect(
        page.locator('[data-config-item-index="2"]')
    ).not.toHaveAttribute("open");
});

test("ignored glob popup links clear filepath filtering and open the referenced config", async ({
    page,
}) => {
    const payload = structuredClone(MOCK_PAYLOAD);
    payload.configs.push({
        index: 3,
        name: "remark/ignored",
        ignores: ["docs/**"],
    });
    await mockPayload(page, payload);
    await page.goto("/configs");
    await page.getByRole("combobox").fill(filepath);
    await expect(
        page.getByText("No matched config items", { exact: true })
    ).toBeVisible();
    await page.getByRole("button", { name: "docs/**", exact: true }).click();
    const popup = page
        .locator(".v-popper--theme-dropdown .v-popper__inner")
        .filter({ hasText: "Configs that contains this glob" });
    await expect(popup).toBeVisible();
    await popup.getByRole("button", { name: /remark\/ignored/ }).click();
    await expect(page).toHaveURL(/\/configs\?index=4$/);
    await expect(page.getByRole("combobox")).toHaveValue("");
    await expect(page.locator('[data-config-item-index="3"]')).toHaveAttribute(
        "open"
    );
    await expect(page.locator("details.flat-config-item:visible")).toHaveCount(
        4
    );
});

test("config and file group gutter indexes remain on one line at desktop width", async ({
    page,
}) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockPayload(page);
    for (const route of ["configs", "files"]) {
        await page.goto(`/${route}`);
        if (route === "files")
            await page.getByTestId("files-view-groups-button").click();
        const indexes = page.locator(
            "details.flat-config-item > summary > div.absolute"
        );
        await expect(indexes.first()).toBeVisible();
        await page.evaluate(async () => document.fonts.ready);
        for (const index of await indexes.all()) {
            await expect(index).toBeVisible();
            const geometry = await index.evaluate((element) => {
                const range = document.createRange();
                range.selectNodeContents(element);
                const textRects = [...range.getClientRects()].filter(
                    (rect) => rect.width > 0 && rect.height > 0
                );
                return {
                    text: element.textContent?.trim(),
                    textHeight:
                        Math.max(...textRects.map((rect) => rect.bottom)) -
                        Math.min(...textRects.map((rect) => rect.top)),
                    singleLineHeight: Math.max(
                        ...textRects.map((rect) => rect.height)
                    ),
                };
            });
            expect(geometry.text).toMatch(/^#\d+$/);
            expect(geometry.singleLineHeight).toBeGreaterThan(0);
            expect(geometry.textHeight).toBeLessThanOrEqual(
                geometry.singleLineHeight + 1
            );
        }
    }
});
