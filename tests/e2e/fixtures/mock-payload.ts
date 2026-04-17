import type { Page } from "@playwright/test";
import process from "node:process";

export const pluginRuleName = "remark-lint-no-dead-urls";
export const extendSpecifier = "remark-preset-lint-recommended";
export const secondaryExtendSpecifier = "@scope/remark-preset-lint-team";

export const MOCK_PAYLOAD = {
    meta: {
        basePath: process.cwd(),
        configPath: ".remarkrc.mjs",
        engine: "remark",
        lastUpdate: Date.now(),
        targetFilePath: "docs/example.md",
    },
    configs: [
        {
            index: 0,
            name: "remark/root",
            rules: {
                [pluginRuleName]: [
                    true,
                    {
                        skipOffline: true,
                    },
                ],
                "remark-lint-final-newline": true,
            },
            plugins: {
                "remark-lint-no-dead-urls": {},
            },
            extends: [extendSpecifier],
        },
        {
            index: 1,
            name: "remark/override-1",
            files: ["**/*.md"],
            rules: {
                "remark-lint-maximum-line-length": 80,
            },
            extends: [secondaryExtendSpecifier],
        },
        {
            index: 2,
            name: "remark/declared-only",
            files: ["**/*.mdx"],
            rules: {
                "remark-lint-no-undefined-references": true,
            },
        },
    ],
    rules: {
        [pluginRuleName]: {
            name: pluginRuleName,
            plugin: "no-dead-urls",
            pluginPackageName: "remark-lint-no-dead-urls",
            fixable: false,
            docs: {
                description: "Disallow dead URLs.",
                descriptionSource: "meta",
                recommended: false,
                url: "https://example.com/plugin-rule",
                urlSource: "meta",
            },
        },
        "remark-lint-final-newline": {
            name: "remark-lint-final-newline",
            plugin: "remark-lint",
            fixable: true,
            docs: {
                description: "Warn when files do not end with a final newline.",
                descriptionSource: "meta",
                recommended: true,
                url: "https://example.com/final-newline",
                urlSource: "meta",
            },
        },
        "remark-lint-maximum-line-length": {
            name: "remark-lint-maximum-line-length",
            plugin: "remark-lint",
            fixable: true,
            docs: {
                description: "Warn when lines exceed the configured maximum length.",
                descriptionSource: "meta",
                recommended: true,
                url: "https://example.com/maximum-line-length",
                urlSource: "meta",
            },
        },
        "remark-lint-no-undefined-references": {
            name: "remark-lint-no-undefined-references",
            plugin: "remark-lint",
            fixable: false,
            docs: {
                description: "Disallow references that were not previously defined.",
                descriptionSource: "meta",
                recommended: true,
                url: "https://example.com/no-undefined-references",
                urlSource: "meta",
            },
        },
    },
    diagnostics: [],
    files: [
        {
            filepath: "docs/example.md",
            globs: ["**/*.md", "docs/**/*.md"],
            configs: [1],
        },
        {
            filepath: "docs/legacy.md",
            globs: ["**/*.md", "docs/**/*.md"],
            configs: [1],
        },
    ],
    extendsInfo: [
        {
            specifier: extendSpecifier,
            source: "package",
            packageName: "remark-preset-lint-recommended",
            docsUrl: "https://example.com/remark-preset-lint-recommended",
            docsUrlSource: "meta",
            ruleCount: 2,
            rules: ["remark-lint-final-newline", "remark-lint-maximum-line-length"],
            usedByConfigIndexes: [0],
        },
        {
            specifier: secondaryExtendSpecifier,
            source: "package",
            packageName: "@scope/remark-preset-lint-team",
            description: "Team conventions for markdown lint baselines.",
            ruleCount: 1,
            rules: ["remark-lint-no-undefined-references"],
            usedByConfigIndexes: [1],
        },
    ],
};

export async function mockPayload(
    page: Page,
    payload = MOCK_PAYLOAD
): Promise<void> {
    await page.route("**/api/payload.json**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(payload),
        });
    });
}
