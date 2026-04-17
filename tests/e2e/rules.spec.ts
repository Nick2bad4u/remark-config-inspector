import { expect, test } from "@playwright/test";
import { mockPayload, pluginRuleName } from "./fixtures/mock-payload";

async function openRulesPage(
    page: import("@playwright/test").Page
): Promise<void> {
    await mockPayload(page);
    await page.goto("/rules");
    await expect(page.getByPlaceholder("Search rules...")).toBeVisible();
    await expect(page.getByText("out of 4 rules")).toBeVisible();
}

async function filterToRule(
    page: import("@playwright/test").Page,
    name: string
): Promise<void> {
    await page.getByPlaceholder("Search rules...").fill(name);
    await expect(
        page.locator(".colorized-rule-name").filter({ hasText: name }).first()
    ).toBeVisible();
}

test.describe("rules page regressions", () => {
    test("built-in rules show source details in popup", async ({
        page,
    }) => {
        await openRulesPage(page);

        const coreRuleRow = page
            .locator("div")
            .filter({
                has: page.locator(
                    '.colorized-rule-name[title="remark-lint-final-newline"]'
                ),
            })
            .first();
        const coreRuleBadge = coreRuleRow
            .locator(
                '.colorized-rule-name[title="remark-lint-final-newline"]'
            )
            .first();
        await expect(coreRuleBadge).toBeVisible();
        await expect(coreRuleBadge).toContainText("remark-lint-final-newline");

        await coreRuleBadge.click();
        const popup = page
            .locator(".v-popper--theme-dropdown .v-popper__inner")
            .filter({ hasText: "Copy name" })
            .first();
        await expect(popup).toContainText("Rule source");
        await expect(popup).toContainText("remark-lint");
        await expect(popup).toContainText("Built-in remark-lint rule package");
    });

    test("plugin chips can narrow rule list and reset back to all plugins", async ({
        page,
    }) => {
        await openRulesPage(page);

        const allPluginsButton = page.locator(".plugin-filter-button", {
            hasText: "All plugins",
        });
        const pluginChip = page.locator(".plugin-filter-button", {
            hasText: "no-dead-urls",
        });

        await expect(pluginChip).toBeVisible();
        await pluginChip.click();

        await expect(page.locator(".colorized-rule-name")).toHaveCount(1);
        await expect(
            page
                .locator(".colorized-rule-name")
                .filter({ hasText: pluginRuleName })
        ).toBeVisible();

        await allPluginsButton.click();
        await expect(page.locator(".colorized-rule-name")).toHaveCount(4);
    });

    test("clear filter resets text search and restores default filtered-state messaging", async ({
        page,
    }) => {
        await openRulesPage(page);

        const search = page.getByPlaceholder("Search rules...");
        await search.fill("dead-urls");

        await expect(
            page.getByRole("button", { name: /clear filter/i })
        ).toBeVisible();
        await expect(page.locator(".colorized-rule-name")).toHaveCount(1);

        await page.getByRole("button", { name: /clear filter/i }).click();

        await expect(search).toHaveValue("");
        await expect(page.locator(".colorized-rule-name")).toHaveCount(4);
        await expect(page.getByText("rules in use")).toBeVisible();
    });

    test("search is case-insensitive for rule names", async ({ page }) => {
        await openRulesPage(page);

        const search = page.getByPlaceholder("Search rules...");
        await search.fill("DEAD-URLS");

        await expect(page.locator(".colorized-rule-name")).toHaveCount(1);
        await expect(
            page
                .locator(".colorized-rule-name")
                .filter({ hasText: pluginRuleName })
        ).toBeVisible();
    });

    test("plugin-prefixed rules expose clear provenance in popup metadata", async ({
        page,
    }) => {
        await openRulesPage(page);
        await filterToRule(page, pluginRuleName);

        const ruleBadgeButton = page
            .locator(".colorized-rule-name")
            .filter({ hasText: pluginRuleName })
            .first();

        await ruleBadgeButton.click();

        const rulePopup = page
            .locator(".v-popper--theme-dropdown .v-popper__inner")
            .filter({ hasText: "Copy name" })
            .first();
        await expect(rulePopup).toBeVisible();
        await expect(rulePopup).toContainText("Rule name");
        await expect(rulePopup).toContainText("Plugin package");
        await expect(rulePopup).toContainText("remark-lint-no-dead-urls");
        await expect(
            rulePopup
                .locator("code")
                .filter({ hasText: pluginRuleName })
                .first()
        ).toBeVisible();
    });

    test("rule badge button is visually reset (no default button chrome)", async ({
        page,
    }) => {
        await openRulesPage(page);
        await filterToRule(page, pluginRuleName);

        const ruleBadgeButton = page
            .locator(".colorized-rule-name--button")
            .filter({ hasText: pluginRuleName })
            .first();
        await expect(ruleBadgeButton).toBeVisible();

        const css = await ruleBadgeButton.evaluate((element) => {
            const style = getComputedStyle(element);
            return {
                borderTopWidth: style.borderTopWidth,
                borderStyle: style.borderStyle,
                paddingLeft: style.paddingLeft,
            };
        });

        expect(css.borderTopWidth).toBe("0px");
        expect(css.borderStyle).toBe("none");
        expect(css.paddingLeft).toBe("0px");
    });

    test("rule-name hover no longer opens a tooltip", async ({ page }) => {
        await openRulesPage(page);
        await filterToRule(page, pluginRuleName);

        const ruleBadgeButton = page
            .locator(".colorized-rule-name")
            .filter({ hasText: pluginRuleName })
            .first();
        await ruleBadgeButton.hover();

        await expect(
            page.locator(".v-popper--theme-tooltip .v-popper__inner")
        ).toHaveCount(0);
    });

    test("plugin filter chips visibly react on hover (clickable affordance)", async ({
        page,
    }) => {
        await openRulesPage(page);

        const pluginFilterChip = page.getByRole("button", {
            name: "All plugins",
        });
        await expect(pluginFilterChip).toBeVisible();

        const beforeHoverShadow = await pluginFilterChip.evaluate(
            (element) => getComputedStyle(element).boxShadow
        );
        await pluginFilterChip.hover();
        const afterHoverShadow = await pluginFilterChip.evaluate(
            (element) => getComputedStyle(element).boxShadow
        );

        expect(beforeHoverShadow).not.toBe(afterHoverShadow);
        expect(afterHoverShadow).not.toBe("none");
    });

    test("list/grid toggle works and preserves rule visibility", async ({
        page,
    }) => {
        await openRulesPage(page);

        const gridButton = page.getByRole("button", { name: "Grid" });
        await gridButton.click();
        await expect(gridButton).toHaveClass(/btn-action-active/);

        await expect(
            page.locator(".colorized-rule-name").first()
        ).toBeVisible();

        const listButton = page.getByRole("button", { name: "List" });
        await listButton.click();
        await expect(listButton).toHaveClass(/btn-action-active/);
        await expect(
            page.locator(".colorized-rule-name").first()
        ).toBeVisible();
    });
});
