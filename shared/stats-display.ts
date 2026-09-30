import type { StatsMessage, StatsPhases, StatsReport } from "./stats";

export type StatsView =
    | "rules"
    | "plugins"
    | "files"
    | "tasks";

export interface StatsRankingRow {
    id: string;
    label: string;
    durationMs: number;
    count: number;
    details: { label: string; durationMs: number }[];
    failed?: boolean;
    diagnostics?: string[];
}

export function statsMessageLabel(message: StatsMessage): string {
    const severity =
        message.fatal === true
            ? "Error"
            : message.fatal === false
              ? "Warning"
              : "Info";
    const location =
        message.line === undefined
            ? ""
            : `line ${message.line}${message.column === undefined ? "" : `:${message.column}`}`;
    const rule = [message.source, message.ruleId].filter(Boolean).join(":");
    return [
        severity,
        location,
        rule,
        message.reason,
    ]
        .filter(Boolean)
        .join(" · ");
}

export function statsPhaseRows(phases: StatsPhases, durationMs: number) {
    const rows = [
        { label: "Initialization", durationMs: phases.initialization },
        { label: "Parse", durationMs: phases.parse },
        { label: "Transform", durationMs: phases.transform },
        { label: "Stringify", durationMs: phases.stringify },
    ];
    rows.push({
        label: "Other",
        durationMs: Math.max(
            0,
            durationMs - rows.reduce((sum, row) => sum + row.durationMs, 0)
        ),
    });
    return rows;
}

/** Aggregate only measured transformers; parser-only plugins have no timing row. */
export function statsRankingRows(
    report: StatsReport,
    view: StatsView
): StatsRankingRow[] {
    if (view === "files")
        return report.files.map((file) => ({
            id: file.filePath,
            label: file.filePath,
            durationMs: file.durationMs,
            count: file.errors + file.warnings,
            details: statsPhaseRows(file.phases, file.durationMs),
            failed: file.failed,
            diagnostics: file.messages.map(statsMessageLabel),
        }));

    const rows = new Map<string, StatsRankingRow>();
    for (const file of report.files) {
        for (const plugin of file.plugins) {
            if (view === "rules" && !plugin.ruleId) continue;
            const identity =
                view === "rules"
                    ? plugin.ruleId!
                    : (plugin.packageName ?? plugin.id);
            const id =
                view === "tasks"
                    ? JSON.stringify([file.filePath, plugin.id])
                    : identity;
            const label =
                view === "tasks"
                    ? `${file.filePath} · ${plugin.name}`
                    : view === "rules"
                      ? plugin.ruleId!
                      : (plugin.packageName ?? plugin.name);
            let row = rows.get(id);
            if (!row) {
                row = { id, label, durationMs: 0, count: 0, details: [] };
                rows.set(id, row);
            }
            row.durationMs += plugin.durationMs;
            row.count += plugin.invocations;
            row.details.push({
                label: view === "tasks" ? plugin.name : file.filePath,
                durationMs: plugin.durationMs,
            });
        }
    }
    return [...rows.values()];
}
