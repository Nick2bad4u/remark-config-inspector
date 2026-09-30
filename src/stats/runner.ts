import type { StatsProgress, StatsReport } from "../../shared/stats";
import type { ReadConfigOptions } from "../configs";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import process from "node:process";
import { dirname, join } from "pathe";

export interface StatsRunOptions {
    signal?: AbortSignal;
    onProgress?: (progress: StatsProgress) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isCount(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isProgress(value: unknown): value is StatsProgress {
    return (
        isRecord(value) &&
        isCount(value["completedFiles"]) &&
        isCount(value["discoveredFiles"]) &&
        (value["currentFile"] === undefined ||
            typeof value["currentFile"] === "string")
    );
}

/** Run executable project configuration in an isolated, cancellable process. */
export function runStats(
    options: ReadConfigOptions,
    runOptions: StatsRunOptions = {}
): Promise<StatsReport> {
    const packagePath = createRequire(import.meta.url).resolve(
        "remark-config-inspector/package.json"
    );
    const workerPath = join(dirname(packagePath), "dist/stats-worker.mjs");
    if (runOptions.signal?.aborted)
        return Promise.reject(new Error("Stats analysis was cancelled."));
    if (!existsSync(workerPath))
        return Promise.reject(
            new Error(
                "Stats worker is missing. Rebuild or reinstall the inspector."
            )
        );

    return new Promise((resolve, reject) => {
        const env = { ...process.env };
        // VS Code's Node bootloader uses this variable to attach to child
        // processes. Profiling should run without its debugger overhead. Keep
        // NODE_OPTIONS intact so project preload hooks and loaders still work.
        delete env["VSCODE_INSPECTOR_OPTIONS"];
        const child = spawn(process.execPath, [workerPath], {
            cwd: options.cwd,
            env,
            stdio: [
                "ignore",
                "pipe",
                "pipe",
                "ipc",
            ],
            windowsHide: true,
        });
        let settled = false;
        let pendingReport: StatsReport | undefined;
        let stderr = "";

        function finish(error?: Error, report?: StatsReport): void {
            if (settled) return;
            settled = true;
            runOptions.signal?.removeEventListener("abort", abort);
            if (error) {
                // Profiling plugins may install signal handlers; cancellation
                // must still terminate their isolated worker deterministically.
                child.kill("SIGKILL");
                reject(error);
            } else if (report) {
                resolve(report);
            }
        }

        function abort(): void {
            finish(new Error("Stats analysis was cancelled."));
        }

        // Drain plugin output without forwarding arbitrary project logs to IPC.
        child.stdout?.resume();
        child.stderr?.setEncoding("utf8");
        child.stderr?.on("data", (chunk: string) => {
            stderr = (stderr + chunk).slice(-8192);
        });
        child.on("error", (error) => finish(error));
        child.on("close", (code, signal) => {
            if (!settled && code === 0 && pendingReport) {
                finish(undefined, pendingReport);
            } else if (!settled) {
                if (stderr.includes("Check failed: new_capacity > 0")) {
                    finish(
                        new Error(
                            `Node.js ${process.version} crashed inside V8 while profiling (new_capacity > 0). An attached debugger or --trace-uncaught can trigger this runtime bug. Run the inspector with Node.js 24 LTS, or disable debugger attachment and remove --trace-uncaught from NODE_OPTIONS for this command. See https://github.com/nodejs/node/issues/66074.`
                        )
                    );
                    return;
                }
                finish(
                    new Error(
                        `Stats worker exited before returning a report (${signal ?? code ?? "unknown"}).${stderr ? `\n${stderr.trim()}` : ""}`
                    )
                );
            }
        });
        child.on("message", (message: unknown) => {
            if (settled || !isRecord(message)) return;
            if (
                message["type"] === "progress" &&
                isProgress(message["progress"])
            ) {
                runOptions.onProgress?.(message["progress"]);
            } else if (message["type"] === "error") {
                finish(
                    new Error(
                        typeof message["message"] === "string"
                            ? message["message"]
                            : "Stats analysis failed."
                    )
                );
            } else if (message["type"] === "result") {
                const report = message["report"];
                // The versioned report is produced by our packaged worker.
                if (
                    isRecord(report) &&
                    report["version"] === 1 &&
                    Array.isArray(report["files"])
                ) {
                    pendingReport = report as unknown as StatsReport;
                } else {
                    finish(
                        new Error("Stats worker returned an invalid report.")
                    );
                }
            }
        });
        runOptions.signal?.addEventListener("abort", abort, { once: true });
        if (runOptions.signal?.aborted) {
            abort();
            return;
        }
        child.send?.({ type: "start", options }, (error) => {
            if (error) finish(error);
        });
    });
}
