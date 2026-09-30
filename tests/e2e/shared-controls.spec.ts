import type { Locator, Page } from "@playwright/test";
import type { Payload } from "../../shared/types";
import { expect, test } from "@playwright/test";
import { MOCK_PAYLOAD, mockPayload } from "./fixtures/mock-payload";

const ruleNames = {
    error: "remark-lint-example-error",
    warn: "remark-lint-example-warning",
    off: "remark-lint-example-disabled",
    unused: "remark-lint-example-unused",
    mixed: "remark-lint-example-overrides",
} as const;

function controlsPayload(): Payload {
    return {
        ...structuredClone(MOCK_PAYLOAD),
        rules: Object.fromEntries(
            Object.values(ruleNames).map((name) => [
                name,
                {
                    name,
                    plugin: "remark-lint",
                    pluginPackageName: name,
                    fixable: name === ruleNames.error,
                    ...(name === ruleNames.error
                        ? {
                              deprecated: {
                                  message: "Use the replacement rule.",
                                  deprecatedSince: "2.0.0",
                              },
                          }
                        : {}),
                    ...(name === ruleNames.warn
                        ? { defaultOptions: [{ mode: "default" }] }
                        : {}),
                    docs: {
                        description: `Validate ${name}.`,
                        recommended: name === ruleNames.error,
                    },
                },
            ])
        ),
        configs: [
            {
                index: 0,
                name: "remark/root",
                rules: {
                    [ruleNames.error]: true,
                    [ruleNames.warn]: [
                        true,
                        { severity: "warning", mode: "configured" },
                    ],
                    [ruleNames.off]: false,
                    [ruleNames.mixed]: true,
                },
            },
            ...[
                false,
                1,
                false,
                true,
            ].map((value, index) => ({
                index: index + 1,
                name: `remark/override-${index + 1}`,
                rules: { [ruleNames.mixed]: value },
            })),
        ],
    };
}

async function openRules(page: Page): Promise<void> {
    await mockPayload(page, controlsPayload());
    await page.goto("/rules");
    await expect(
        page.getByText("Remark Config Inspector", { exact: true })
    ).toBeVisible();
    await page.getByRole("button", { name: "List", exact: true }).click();
}

/** Check actual text/icon boxes; visibility alone misses overflow clipping. */
async function expectContentFits(container: Locator): Promise<void> {
    const escapedContent = await container.evaluate((element) => {
        const outer = element.getBoundingClientRect();
        const failures: string[] = [];
        const check = (rect: DOMRect, description: string) => {
            if (
                rect.width > 0 &&
                rect.height > 0 &&
                (rect.left < outer.left - 1 ||
                    rect.right > outer.right + 1 ||
                    rect.top < outer.top - 1 ||
                    rect.bottom > outer.bottom + 1)
            )
                failures.push(description);
        };
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!node.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects())
                check(rect, node.textContent.trim());
        }
        for (const icon of element.querySelectorAll('[class*="i-ph-"]'))
            check(icon.getBoundingClientRect(), icon.className);
        return failures;
    });
    expect(
        escapedContent,
        "Text and icon boxes must fit their control boundary"
    ).toEqual([]);
}

for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
]) {
    for (const fontScale of [
        "sm",
        "md",
        "lg",
    ] as const) {
        test(`state chips and filter labels fit at ${viewport.width}px with ${fontScale} text`, async ({
            page,
        }) => {
            await page.setViewportSize(viewport);
            await page.addInitScript(
                (scale) =>
                    localStorage.setItem(
                        "stateStorage",
                        JSON.stringify({
                            fontScale: scale,
                            rulesViewType: "list",
                        })
                    ),
                fontScale
            );
            await openRules(page);
            for (const groupName of [
                "Rule state filter",
                "Rule status filter",
            ]) {
                for (const label of await page
                    .getByRole("group", { name: groupName })
                    .locator("label")
                    .all())
                    await expectContentFits(label);
            }
            for (const name of [ruleNames.error, ruleNames.mixed]) {
                await page
                    .getByRole("textbox", {
                        name: "Search rules",
                        exact: true,
                    })
                    .fill(name);
                const rail = page.getByTestId("rule-state-rail").first();
                const badges = rail.getByTestId("rule-level-icon");
                await expect(badges).toHaveCount(
                    name === ruleNames.error ? 1 : 2
                );
                for (const badge of await badges.all())
                    await expectContentFits(badge);
                const geometry = await rail.evaluate((element) => {
                    const railBox = element.getBoundingClientRect();
                    const cellBox =
                        element.parentElement!.getBoundingClientRect();
                    const nameBox =
                        element.parentElement!.nextElementSibling!.getBoundingClientRect();
                    const metadata =
                        element.parentElement!.nextElementSibling!
                            .nextElementSibling!;
                    const metadataBox = metadata.getBoundingClientRect();
                    const descriptionBox =
                        metadata.nextElementSibling!.getBoundingClientRect();
                    const metadataIcons = [
                        ...metadata.querySelectorAll(":scope > div > div"),
                    ].map((icon) => {
                        const box = icon.getBoundingClientRect();
                        return { left: box.left, right: box.right };
                    });
                    const children = [
                        ...element.querySelectorAll(
                            '[data-testid="rule-level-icon"], [data-testid="rule-state-overflow"]'
                        ),
                    ].map((child) => {
                        const box = child.getBoundingClientRect();
                        return {
                            left: box.left,
                            right: box.right,
                            top: box.top,
                            bottom: box.bottom,
                        };
                    });
                    return {
                        rail: {
                            left: railBox.left,
                            right: railBox.right,
                            top: railBox.top,
                            bottom: railBox.bottom,
                        },
                        cellRight: cellBox.right,
                        nameLeft: nameBox.left,
                        metadata: {
                            left: metadataBox.left,
                            right: metadataBox.right,
                            descriptionLeft: descriptionBox.left,
                            icons: metadataIcons,
                        },
                        children,
                    };
                });
                for (const child of geometry.children) {
                    expect(child.left).toBeGreaterThanOrEqual(
                        geometry.rail.left - 1
                    );
                    expect(child.right).toBeLessThanOrEqual(
                        geometry.rail.right + 1
                    );
                    expect(child.top).toBeGreaterThanOrEqual(
                        geometry.rail.top - 1
                    );
                    expect(child.bottom).toBeLessThanOrEqual(
                        geometry.rail.bottom + 1
                    );
                    expect(child.right).toBeLessThanOrEqual(
                        geometry.cellRight + 1
                    );
                    expect(child.right).toBeLessThanOrEqual(
                        geometry.nameLeft + 1
                    );
                }
                for (let index = 1; index < geometry.children.length; index++)
                    expect(
                        geometry.children[index]!.left
                    ).toBeGreaterThanOrEqual(
                        geometry.children[index - 1]!.right - 1
                    );
                for (const icon of geometry.metadata.icons) {
                    expect(icon.left).toBeGreaterThanOrEqual(
                        geometry.metadata.left - 1
                    );
                    expect(icon.right).toBeLessThanOrEqual(
                        geometry.metadata.right + 1
                    );
                    expect(icon.right).toBeLessThanOrEqual(
                        geometry.metadata.descriptionLeft + 1
                    );
                }
            }
            await page
                .getByRole("button", { name: "Grid", exact: true })
                .click();
            const gridRail = page.getByTestId("rule-state-rail").first();
            await expect(gridRail.getByTestId("rule-level-icon")).toHaveCount(
                2
            );
            await expect(
                gridRail.getByTestId("rule-state-overflow")
            ).toHaveText("+3");
            const gridGeometry = await gridRail.evaluate((element) => {
                const stateBox = element.getBoundingClientRect();
                const nameBox =
                    element.parentElement!.nextElementSibling!.getBoundingClientRect();
                const cardBox =
                    element.parentElement!.parentElement!.getBoundingClientRect();
                return {
                    stateBottom: stateBox.bottom,
                    nameTop: nameBox.top,
                    stateLeft: stateBox.left,
                    stateRight: stateBox.right,
                    cardLeft: cardBox.left,
                    cardRight: cardBox.right,
                };
            });
            expect(gridGeometry.nameTop).toBeGreaterThanOrEqual(
                gridGeometry.stateBottom - 1
            );
            expect(gridGeometry.stateLeft).toBeGreaterThanOrEqual(
                gridGeometry.cardLeft - 1
            );
            expect(gridGeometry.stateRight).toBeLessThanOrEqual(
                gridGeometry.cardRight + 1
            );
        });
    }

    test(`state and status filters change the actual result set at ${viewport.width}px`, async ({
        page,
    }) => {
        await page.setViewportSize(viewport);
        await openRules(page);
        const state = page.getByRole("group", { name: "Rule state filter" });
        const status = page.getByRole("group", { name: "Rule status filter" });
        const displayedNames = () =>
            page
                .locator("button.colorized-rule-name")
                .evaluateAll((elements) =>
                    elements
                        .map((element) => element.getAttribute("title"))
                        .toSorted()
                );
        for (const [label, names] of [
            ["All", Object.values(ruleNames)],
            [
                "Using",
                [
                    ruleNames.error,
                    ruleNames.warn,
                    ruleNames.off,
                    ruleNames.mixed,
                ],
            ],
            ["Unused", [ruleNames.unused]],
            ["Error", [ruleNames.error, ruleNames.mixed]],
            ["Warn", [ruleNames.warn, ruleNames.mixed]],
            ["Off", [ruleNames.off, ruleNames.mixed]],
            ["Overloaded", [ruleNames.mixed]],
            ["Off Only", [ruleNames.off]],
        ] as const) {
            const radio = state.getByRole("radio", {
                name: label,
                exact: true,
            });
            await radio.check();
            await expect(radio).toBeChecked();
            await expect.poll(displayedNames).toEqual([...names].toSorted());
        }
        await state.getByRole("radio", { name: "All", exact: true }).check();
        for (const [label, names] of [
            [
                "Active",
                [
                    ruleNames.error,
                    ruleNames.warn,
                    ruleNames.mixed,
                ],
            ],
            ["Recommended", [ruleNames.error]],
            ["Fixable", [ruleNames.error]],
            ["Deprecated", [ruleNames.error]],
            ["All", Object.values(ruleNames)],
        ] as const) {
            await status
                .getByRole("radio", { name: label, exact: true })
                .check();
            await expect.poll(displayedNames).toEqual([...names].toSorted());
        }
        await state.getByRole("radio", { name: "Unused", exact: true }).check();
        await status
            .getByRole("radio", { name: "Fixable", exact: true })
            .check();
        await expect(
            page.getByText("No rules match the active filters", { exact: true })
        ).toBeVisible();
        await page
            .getByRole("button", { name: "Reset rule filters", exact: true })
            .click();
        await expect(
            state.getByRole("radio", { name: "Using", exact: true })
        ).toBeChecked();
        await expect(
            status.getByRole("radio", { name: "All", exact: true })
        ).toBeChecked();
    });
}

test("overflow trace opens from keyboard and Escape dismisses it without shifting the row", async ({
    page,
}) => {
    await openRules(page);
    await page
        .getByRole("textbox", { name: "Search rules", exact: true })
        .fill("overrides");
    // Wait for debounced fuzzy search; shared identifier prefixes match other rules.
    await expect(
        page.locator("button.colorized-rule-name:visible")
    ).toHaveCount(1);
    await expect(
        page.locator(`button.colorized-rule-name[title="${ruleNames.mixed}"]`)
    ).toBeVisible();
    await page.evaluate(async () => {
        await document.fonts.ready;
    });
    const overflow = page.getByTestId("rule-state-overflow");
    // Keyboard focus can scroll the viewport; compare document layout instead.
    const documentBox = () =>
        overflow.evaluate((element) => {
            const box = element.getBoundingClientRect();
            return {
                x: box.x + window.scrollX,
                y: box.y + window.scrollY,
                width: box.width,
                height: box.height,
            };
        });
    const before = await documentBox();
    await overflow.focus();
    await page.keyboard.press("Enter");
    const popup = page
        .locator(".v-popper__inner:visible")
        .filter({ has: page.locator(".rule-state-panel--popover") });
    await expect(popup).toBeVisible();
    await expect(popup.locator(".rule-state-panel--popover")).toHaveCount(3);
    await popup.locator(".rule-state-config-button").last().focus();
    await page.keyboard.press("Escape");
    await expect(popup).not.toBeVisible();
    await expect(overflow).toBeFocused();
    expect(await documentBox()).toEqual(before);
});

test("state options switch to defaults and config navigation preserves the selected rule", async ({
    page,
}) => {
    await openRules(page);
    await page
        .getByRole("textbox", { name: "Search rules", exact: true })
        .fill(ruleNames.warn);
    await page
        .locator(`button.colorized-rule-name[title="${ruleNames.warn}"]`)
        .click();
    const popup = page
        .locator(".v-popper__inner:visible")
        .filter({ hasText: "Copy name" });
    const panel = popup.locator(".rule-state-panel");
    await expect(
        panel.getByRole("button", { name: "Rule options", exact: true })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(panel.locator("pre")).toContainText([
        "configuredPrimaryOption: true",
        "configured",
    ]);
    await panel
        .getByRole("button", { name: "Option defaults", exact: true })
        .click();
    await expect(
        panel.getByRole("button", { name: "Option defaults", exact: true })
    ).toHaveAttribute("aria-pressed", "true");
    await expect(panel.locator("pre")).toContainText("default");
    await panel
        .getByRole("button", { name: "Rule options", exact: true })
        .click();
    await expect(panel.locator("pre").last()).toContainText("configured");
    await panel.locator(".rule-state-config-button").click();
    await expect(page).toHaveURL(/\/configs$/);
    await expect(
        page.getByRole("button", { name: "Clear rule filter", exact: true })
    ).toBeVisible();
    await expect(
        page.locator(`.colorized-rule-name[title="${ruleNames.warn}"]`).first()
    ).toBeVisible();
});

test("outside click dismisses settings without stealing focus from search", async ({
    page,
}) => {
    await openRules(page);
    await page.getByRole("button", { name: /^Font size:/ }).click();
    const option = page.getByRole("button", { name: /^Large / });
    await expect(option).toBeVisible();
    const search = page.getByRole("textbox", {
        name: "Search rules",
        exact: true,
    });
    await search.click();
    await expect(option).not.toBeVisible();
    await expect(search).toBeFocused();
    await page.keyboard.type("warning");
    await expect(page.locator("button.colorized-rule-name")).toHaveCount(1);
});

test("theme and disabled-rule dimming persist and change the rendered UI", async ({
    page,
}) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openRules(page);
    const background = () =>
        page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const initialBackground = await background();
    await page
        .getByRole("button", { name: "Toggle dark mode", exact: true })
        .click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await background()).not.toBe(initialBackground);
    await page
        .getByRole("textbox", { name: "Search rules", exact: true })
        .fill(ruleNames.off);
    await expect(page.locator(".rule-muted-off").first()).toBeVisible();
    await page
        .getByTitle("Disable dimming for disabled rules", { exact: true })
        .click();
    await expect(
        page.getByTitle("Enable dimming for disabled rules", { exact: true })
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".rule-muted-off")).toHaveCount(0);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(
        page.getByTitle("Enable dimming for disabled rules", { exact: true })
    ).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".rule-muted-off")).toHaveCount(0);
    await page
        .getByTitle("Enable dimming for disabled rules", { exact: true })
        .click();
    await expect(page.locator(".rule-muted-off").first()).toBeVisible();
});

test("deprecated navigation sets the rule filters", async ({ page }) => {
    await openRules(page);
    await page.getByTestId("nav-link-configs").click();
    await page
        .getByRole("button", { name: "Using 1 deprecated rules", exact: true })
        .click();
    await expect(page).toHaveURL(/\/rules$/);
    await expect(
        page
            .getByRole("group", { name: "Rule status filter" })
            .getByRole("radio", { name: "Deprecated", exact: true })
    ).toBeChecked();
    const rule = page.locator(
        `button.colorized-rule-name[title="${ruleNames.error}"]`
    );
    await expect(rule).toHaveCount(1);
});

test("Copy name writes the exact rule identifier", async ({
    page,
    context,
    browserName,
}) => {
    test.skip(
        browserName !== "chromium",
        "Native clipboard permission coverage uses Chromium."
    );
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openRules(page);
    const rule = page.locator(
        `button.colorized-rule-name[title="${ruleNames.error}"]`
    );
    await rule.click();
    const popup = page
        .locator(".v-popper__inner:visible")
        .filter({ hasText: "Copy name" });
    await popup.getByRole("button", { name: "Copy name", exact: true }).click();
    await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(ruleNames.error);
});
