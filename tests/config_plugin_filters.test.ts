import { describe, expect, it } from "vitest";
import {
    configMatchesPluginFilters,
    configMatchesRulePluginFilters,
    getConfigPluginFilters,
    getRulePluginName,
    resolveConfigPluginFilter,
    ruleMatchesPluginFilters,
    toPluginFilterCandidates,
} from "../shared/config-plugin-filters";

describe("config plugin filters", () => {
    it("maps remark plugin package names to the corresponding rule plugin filter", () => {
        const knownRulePlugins = new Set(["remark-lint", "@acme/remark-lint"]);

        expect(
            resolveConfigPluginFilter(
                "remark-lint-no-dead-urls",
                knownRulePlugins
            )
        ).toBe("remark-lint");

        expect(
            resolveConfigPluginFilter(
                "@acme/remark-lint-table-pipe-alignment",
                knownRulePlugins
            )
        ).toBe("@acme/remark-lint");
    });

    it("collects config plugin filters from explicit plugins and configured rule prefixes", () => {
        const knownRulePlugins = new Set(["remark-lint", "@acme/remark-lint"]);
        const config = {
            index: 0,
            plugins: {
                "remark-lint-no-dead-urls": {},
                "@acme/remark-lint-table-pipe-alignment": {},
            },
            rules: {
                "remark-lint-final-newline": true,
                "@acme/remark-lint/no-gap-hack": true,
                "no-empty-url": true,
            },
        };

        expect(getConfigPluginFilters(config, knownRulePlugins)).toEqual([
            "@acme/remark-lint",
            "remark-lint",
        ]);
    });

    it("matches configs against selected plugin filters", () => {
        const knownRulePlugins = new Set(["remark-lint"]);
        const config = {
            index: 0,
            plugins: {
                "remark-lint-no-dead-urls": {},
            },
            rules: {
                "remark-lint-final-newline": true,
            },
        };

        expect(
            configMatchesPluginFilters(
                config,
                ["remark-lint"],
                knownRulePlugins
            )
        ).toBe(true);
        expect(
            configMatchesPluginFilters(config, ["remark"], knownRulePlugins)
        ).toBe(false);
    });

    it("matches rule names against selected plugin filters", () => {
        expect(
            ruleMatchesPluginFilters("remark-lint-final-newline", [
                "remark-lint",
            ])
        ).toBe(true);
        expect(
            ruleMatchesPluginFilters("@acme/remark-lint/no-gap-hack", [
                "@acme/remark-lint",
            ])
        ).toBe(true);
        expect(ruleMatchesPluginFilters("no-empty-url", ["remark-lint"])).toBe(
            false
        );
    });

    it("matches config plugin filters only when the config declares plugin-scoped rules", () => {
        const config = {
            index: 0,
            plugins: {
                "remark-lint-no-dead-urls": {},
            },
            rules: {
                "no-empty-url": true,
            },
        };

        expect(configMatchesRulePluginFilters(config, ["remark-lint"])).toBe(
            false
        );
    });

    it("extracts plugin names from scoped and remark-prefixed rules", () => {
        expect(getRulePluginName("@acme/remark-lint/no-gap-hack")).toBe(
            "@acme/remark-lint"
        );
        expect(getRulePluginName("remark-lint-final-newline")).toBe(
            "remark-lint"
        );
        expect(getRulePluginName("@acme/no-gap-hack")).toBe("@acme");
    });

    it("produces scoped plugin candidates for remark package names", () => {
        const candidates = toPluginFilterCandidates(
            "@acme/remark-lint-table-pipe-alignment"
        );

        expect(candidates).toContain("@acme/remark-lint");
        expect(candidates).toContain("@acme");
        expect(candidates).toContain("remark-lint");
    });

    it("falls back to config rule plugin names when known plugins are not pre-populated", () => {
        expect(
            resolveConfigPluginFilter(
                "@acme/remark-lint-table-pipe-alignment",
                [],
                ["@acme/remark-lint"]
            )
        ).toBe("@acme/remark-lint");
    });

    it("treats empty plugin selection as a pass-through for config filtering", () => {
        const config = {
            index: 0,
            plugins: {
                "remark-lint-no-dead-urls": {},
            },
            rules: {
                "remark-lint-final-newline": true,
            },
        };

        expect(configMatchesPluginFilters(config, [], ["remark-lint"])).toBe(
            true
        );
    });
});
