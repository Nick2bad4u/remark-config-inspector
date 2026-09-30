import type { StatsReport } from "../../../shared/stats";

export const STATS_REPORT: StatsReport = {
    version: 1,
    createdAt: 1_770_000_000_000,
    wallTimeMs: 150,
    durationMs: 100,
    phases: { initialization: 10, parse: 20, transform: 40, stringify: 20 },
    errorCount: 1,
    warningCount: 2,
    partial: false,
    diagnostics: [],
    files: [
        {
            filePath: "docs/slow.md",
            durationMs: 80,
            phases: {
                initialization: 8,
                parse: 16,
                transform: 32,
                stringify: 16,
            },
            plugins: [
                {
                    id: "links",
                    name: "remark-lint-links",
                    ruleId: "links",
                    packageName: "remark-lint-links",
                    durationMs: 30,
                    invocations: 1,
                },
                {
                    id: "headings",
                    name: "remark-lint-headings",
                    ruleId: "headings",
                    packageName: "remark-lint-headings",
                    durationMs: 2,
                    invocations: 1,
                },
            ],
            errors: 1,
            warnings: 1,
            messages: [],
            failed: false,
        },
        {
            filePath: "readme.md",
            durationMs: 20,
            phases: { initialization: 2, parse: 4, transform: 8, stringify: 4 },
            plugins: [
                {
                    id: "links",
                    name: "remark-lint-links",
                    ruleId: "links",
                    packageName: "remark-lint-links",
                    durationMs: 8,
                    invocations: 1,
                },
            ],
            errors: 0,
            warnings: 1,
            messages: [],
            failed: false,
        },
    ],
};
