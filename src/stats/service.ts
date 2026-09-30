import type { StatsJob, StatsReport } from "../../shared/stats";
import type { ReadConfigOptions } from "../configs";
import type { StatsRunOptions } from "./runner";
import { runStats } from "./runner";

type StatsRunner = (
    options: ReadConfigOptions,
    runOptions: StatsRunOptions
) => Promise<StatsReport>;

export interface StatsService {
    getStatus: () => StatsJob;
    run: () => StatsJob;
    cancel: () => StatsJob;
    invalidate: () => void;
    close: () => void;
}

function idleJob(): StatsJob {
    return {
        status: "idle",
        progress: { completedFiles: 0, discoveredFiles: 0 },
    };
}

/** Own one analysis at a time, discarding results from cancelled generations. */
export function createStatsService(
    options: ReadConfigOptions,
    runner: StatsRunner = runStats
): StatsService {
    let job = idleJob();
    let controller: AbortController | undefined;
    let generation = 0;
    let closed = false;

    function stop(): void {
        generation += 1;
        controller?.abort();
        controller = undefined;
    }

    return {
        getStatus: () => job,
        run() {
            if (closed) throw new Error("The inspector session has closed.");
            if (job.status === "running") return job;
            const currentGeneration = ++generation;
            const activeController = new AbortController();
            controller = activeController;
            job = {
                status: "running",
                startedAt: Date.now(),
                progress: { completedFiles: 0, discoveredFiles: 0 },
            };
            void Promise.resolve()
                .then(() =>
                    runner(options, {
                        signal: activeController.signal,
                        onProgress(progress) {
                            if (generation === currentGeneration)
                                job = { ...job, progress };
                        },
                    })
                )
                .then(
                    (report) => {
                        if (generation !== currentGeneration) return;
                        controller = undefined;
                        job = {
                            ...job,
                            status: report.partial ? "partial" : "complete",
                            report,
                            progress: {
                                completedFiles: report.files.length,
                                discoveredFiles: report.files.length,
                            },
                        };
                    },
                    (error: unknown) => {
                        if (generation !== currentGeneration) return;
                        controller = undefined;
                        job = {
                            ...job,
                            status: "failed",
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        };
                    }
                );
            return job;
        },
        cancel() {
            if (job.status === "running") {
                stop();
                job = { ...job, status: "cancelled" };
            }
            return job;
        },
        invalidate() {
            stop();
            job = idleJob();
        },
        close() {
            closed = true;
            stop();
        },
    };
}
