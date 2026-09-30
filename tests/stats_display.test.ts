import { describe, expect, it } from "vitest";
import {
    statsMessageLabel,
    statsPhaseRows,
    statsRankingRows,
} from "../shared/stats-display";
import { STATS_REPORT } from "./e2e/fixtures/stats";

describe("stats display aggregation", () => {
    it("preserves failed-file diagnostics with severity, location and rule context", () => {
        const report = structuredClone(STATS_REPORT);
        report.files[0]!.failed = true;
        report.files[0]!.messages = [
            {
                fatal: true,
                reason: "Referenced document is unreadable",
                source: "remark-lint",
                ruleId: "links",
                line: 4,
                column: 2,
            },
        ];
        expect(statsRankingRows(report, "files")[0]).toMatchObject({
            failed: true,
            diagnostics: [
                "Error · line 4:2 · remark-lint:links · Referenced document is unreadable",
            ],
        });
        expect(
            statsMessageLabel({
                fatal: false,
                reason: "Missing heading",
                line: 3,
            })
        ).toBe("Warning · line 3 · Missing heading");
        expect(
            statsMessageLabel({ fatal: null, reason: "Skipped optional check" })
        ).toBe("Info · Skipped optional check");
    });
    it("sums repeated rule measurements across files without using wall time", () => {
        const rows = statsRankingRows(STATS_REPORT, "rules");
        expect(rows.find((row) => row.label === "links")).toEqual({
            id: "links",
            label: "links",
            count: 2,
            durationMs: 38,
            details: [
                { label: "docs/slow.md", durationMs: 30 },
                { label: "readme.md", durationMs: 8 },
            ],
        });
        expect(
            statsPhaseRows(STATS_REPORT.phases, STATS_REPORT.durationMs).at(-1)
        ).toEqual({ label: "Other", durationMs: 10 });
    });

    it("keeps individual tasks separate and exposes file diagnostics and phases", () => {
        expect(statsRankingRows(STATS_REPORT, "tasks")).toHaveLength(3);
        const [file] = statsRankingRows(STATS_REPORT, "files");
        expect(file).toMatchObject({
            label: "docs/slow.md",
            durationMs: 80,
            count: 2,
        });
        expect(file?.details.at(-1)).toEqual({ label: "Other", durationMs: 8 });
    });

    it("lists non-rule transformers only in plugin and task rankings", () => {
        const report = structuredClone(STATS_REPORT);
        report.files[0]!.plugins.push({
            id: "custom",
            name: "Custom transformer",
            durationMs: 1,
            invocations: 2,
        });
        expect(statsRankingRows(report, "rules")).toHaveLength(2);
        expect(statsRankingRows(report, "plugins")).toHaveLength(3);
        expect(
            statsPhaseRows(
                { initialization: 1, parse: 1, transform: 1, stringify: 1 },
                3
            ).at(-1)?.durationMs
        ).toBe(0);
    });
});
