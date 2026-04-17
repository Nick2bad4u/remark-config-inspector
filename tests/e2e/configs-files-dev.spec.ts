import { expect, test } from "@playwright/test";
import { testIds } from "../../shared/test-ids";
import {
    MOCK_PAYLOAD,
    mockPayload,
    secondaryExtendSpecifier,
} from "./fixtures/mock-payload";

async function openConfigs(
    page: import("@playwright/test").Page,
    payload = MOCK_PAYLOAD
): Promise<void> {
    await mockPayload(page, payload);
    await page.goto("/configs");
    await expect(
        page.getByPlaceholder("Test matching with filepath...")
    ).toBeVisible();
}

async function openFiles(
    page: import("@playwright/test").Page,
    payload = MOCK_PAYLOAD
): Promise<void> {
    await mockPayload(page, payload);
    await page.goto("/files");
    await expect(page.getByTestId(testIds.files.viewListButton)).toBeVisible();
}

async function openDev(
    page: import("@playwright/test").Page,
    payload = MOCK_PAYLOAD
): Promise<void> {
    await mockPayload(page, payload);
    await page.goto("/dev");
    await expect(page.getByText("Inspector snapshot")).toBeVisible();
}

test.describe("configs/files/dev regressions", () => {
    test("configs expand/collapse all toggles every visible config item", async ({
        page,
    }) => {
        await openConfigs(page);

        const configItems = page.locator("details.flat-config-item:visible");
        await expect(configItems).toHaveCount(3);

        await page.getByRole("button", { name: "Collapse All" }).click();
        const areAllCollapsed = await configItems.evaluateAll((items) =>
            items.every((item) => !(item as HTMLDetailsElement).open)
        );
        expect(areAllCollapsed).toBe(true);

        await page.getByRole("button", { name: "Expand All" }).click();
        const areAllExpanded = await configItems.evaluateAll((items) =>
            items.every((item) => (item as HTMLDetailsElement).open)
        );
        expect(areAllExpanded).toBe(true);
    });

    test("configs filepath filters and specific-only toggle update visible config state", async ({
        page,
    }) => {
        await openConfigs(page);

        await page
            .getByPlaceholder("Test matching with filepath...")
            .fill("docs/example.md");

        const matchedConfigsButton = page.getByRole("button", {
            name: "Matched Config Items",
        });
        await matchedConfigsButton.click();
        await expect(matchedConfigsButton).toHaveClass(/btn-action-active/);
        await expect(page.getByText("matched with")).toBeVisible();
        const visibleBefore = await page
            .locator("details.flat-config-item:visible")
            .count();

        await page.getByLabel("Show Specific Rules Only").check();
        const visibleAfter = await page
            .locator("details.flat-config-item:visible")
            .count();

        expect(visibleAfter).toBeLessThan(visibleBefore);
        expect(visibleAfter).toBe(1);
    });

    test("configs plugin chip filtering narrows and resets config list", async ({
        page,
    }) => {
        await openConfigs(page);

        const configItems = page.locator("details.flat-config-item:visible");
        await expect(configItems).toHaveCount(3);

        const pluginChip = page.locator(".plugin-filter-button", {
            hasText: "no-dead-urls",
        });
        await pluginChip.click();

        await expect(configItems).toHaveCount(1);

        await page
            .locator(".plugin-filter-button", {
                hasText: "All plugins",
            })
            .click();

        await expect(configItems).toHaveCount(3);
    });

    test("files group mode expand/collapse controls affect every file group", async ({
        page,
    }) => {
        await openFiles(page);

        await page.getByTestId(testIds.files.viewGroupsButton).click();

        const groupItems = page.locator("details.flat-config-item");
        await expect(groupItems.first()).toBeVisible();

        await page.getByRole("button", { name: "Collapse All" }).click();
        const groupsCollapsed = await groupItems.evaluateAll((items) =>
            items.every((item) => !(item as HTMLDetailsElement).open)
        );
        expect(groupsCollapsed).toBe(true);

        await page.getByRole("button", { name: "Expand All" }).click();
        const groupsExpanded = await groupItems.evaluateAll((items) =>
            items.every((item) => (item as HTMLDetailsElement).open)
        );
        expect(groupsExpanded).toBe(true);
    });

    test("files page shows empty-state guidance when matched files are unavailable", async ({
        page,
    }) => {
        await mockPayload(page, {
            ...MOCK_PAYLOAD,
            files: undefined,
        });
        await page.goto("/files");

        await expect(
            page.getByText("File matching data is unavailable in the current payload")
        ).toBeVisible();
        await expect(page.getByText("--files")).toBeVisible();
    });

    test("dev page shows fallback copy when diagnostics and .remarkignore data are absent", async ({
        page,
    }) => {
        await openDev(page);

        await expect(page.getByText("No diagnostics emitted.")).toBeVisible();
        await expect(
            page.getByText("No .remarkignore file was discovered.")
        ).toBeVisible();
        await expect(page.getByText("No active viewer filters.")).toBeVisible();
    });

    test("dev page renders diagnostics and .remarkignore patterns when provided", async ({
        page,
    }) => {
        await openDev(page, {
            ...MOCK_PAYLOAD,
            diagnostics: ["⚠ first warning", "ℹ info note"],
            meta: {
                ...MOCK_PAYLOAD.meta,
                ignoreFile: {
                    path: ".remarkignore",
                    patterns: ["dist/**", "coverage/**"],
                },
            },
        });

        await expect(page.getByText("⚠ first warning")).toBeVisible();
        await expect(page.getByText("ℹ info note")).toBeVisible();
        await expect(page.getByText("dist/**")).toBeVisible();
        await expect(page.getByText("coverage/**")).toBeVisible();
    });

    test("viewer filter tags on dev page reflect filters set across configs and rules pages", async ({
        page,
    }) => {
        await mockPayload(page);
        await page.goto("/configs");

        await page
            .getByPlaceholder("Test matching with filepath...")
            .fill("docs/example.md");
        await page
            .locator(".plugin-filter-button", { hasText: "no-dead-urls" })
            .click();

        await page.getByTestId(testIds.nav.rulesLink).click();
        await page
            .locator(".plugin-filter-button", { hasText: "no-dead-urls" })
            .click();

        await page.getByTestId(testIds.nav.devLink).click();

        await expect(page.getByText("filepath:docs/example.md")).toBeVisible();
        await expect(
            page.getByText("config-plugin:remark-lint-no-dead-urls")
        ).toBeVisible();
        await expect(page.getByText("rules-plugin:no-dead-urls")).toBeVisible();
    });

    test("extends-to-configs navigation opens the targeted config index", async ({
        page,
    }) => {
        await mockPayload(page);
        await page.goto("/extends");

        await page
            .getByTestId(testIds.extends.specifierButton)
            .filter({ hasText: secondaryExtendSpecifier })
            .first()
            .click();

        await page
            .locator('a[href="/configs?index=2"]')
            .first()
            .click();

        await expect(page).toHaveURL(/\/configs\?index=2$/);
        await expect(page.locator('[data-config-item-index="1"]')).toHaveAttribute(
            "open",
            ""
        );
    });
});
