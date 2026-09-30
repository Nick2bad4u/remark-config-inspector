/** Elapsed milliseconds spent in each processing phase. */
export interface StatsPhases {
    initialization: number;
    parse: number;
    transform: number;
    stringify: number;
}

/** One plugin's transformer measurements for a file. */
export interface StatsPluginTiming {
    id: string;
    name: string;
    packageName?: string;
    ruleId?: string;
    durationMs: number;
    invocations: number;
}

export interface StatsMessage {
    reason: string;
    fatal: boolean | null;
    ruleId?: string;
    source?: string;
    line?: number;
    column?: number;
}

export interface StatsFileResult {
    filePath: string;
    durationMs: number;
    phases: StatsPhases;
    plugins: StatsPluginTiming[];
    errors: number;
    warnings: number;
    messages: StatsMessage[];
    failed: boolean;
}

/** Portable snapshot. Paths are relative to the inspected workspace. */
export interface StatsReport {
    version: 1;
    createdAt: number;
    wallTimeMs: number;
    durationMs: number;
    phases: StatsPhases;
    files: StatsFileResult[];
    errorCount: number;
    warningCount: number;
    partial: boolean;
    diagnostics: string[];
}

export interface StatsProgress {
    completedFiles: number;
    discoveredFiles: number;
    currentFile?: string;
}

export type StatsStatus =
    | "idle"
    | "running"
    | "complete"
    | "partial"
    | "failed"
    | "cancelled";

export interface StatsJob {
    status: StatsStatus;
    progress: StatsProgress;
    startedAt?: number;
    report?: StatsReport;
    error?: string;
}
