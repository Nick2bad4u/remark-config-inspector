import type { StatsReport } from "../shared/stats";
import type { StatsRunOptions } from "../src/stats/runner";
import { describe, expect, it, vi } from "vitest";
import { createStatsService } from "../src/stats/service";

function report(partial = false): StatsReport {
    return {
        version: 1,
        createdAt: 1,
        wallTimeMs: 10,
        durationMs: 5,
        phases: { initialization: 1, parse: 1, transform: 2, stringify: 1 },
        files: [],
        errorCount: 0,
        warningCount: 0,
        partial,
        diagnostics: partial ? ["A file failed"] : [],
    };
}

function pendingReport() {
    let resolve!: (value: StatsReport) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<StatsReport>((accept, decline) => {
        resolve = accept;
        reject = decline;
    });
    return { promise, resolve, reject };
}

describe("stats service lifecycle", () => {
    it("runs only one analysis and publishes progress and completion", async () => {
        const pending = pendingReport();
        const runner = vi.fn(
            (_options, _runOptions: StatsRunOptions) => pending.promise
        );
        const options = { cwd: "/workspace", userConfigPath: ".remarkrc.mjs" };
        const service = createStatsService(options, runner);
        expect(service.getStatus().status).toBe("idle");
        const running = service.run();
        expect(service.run()).toBe(running);
        await Promise.resolve();
        expect(runner).toHaveBeenCalledOnce();
        expect(runner.mock.calls[0]?.[0]).toBe(options);
        runner.mock.calls[0]?.[1].onProgress?.({
            completedFiles: 2,
            discoveredFiles: 3,
            currentFile: "docs.md",
        });
        expect(service.getStatus().progress).toEqual({
            completedFiles: 2,
            discoveredFiles: 3,
            currentFile: "docs.md",
        });
        const result = report();
        pending.resolve(result);
        await vi.waitFor(() =>
            expect(service.getStatus().status).toBe("complete")
        );
        expect(service.getStatus().report).toBe(result);
        service.close();
    });

    it.each([
        "cancel",
        "invalidate",
        "close",
    ] as const)(
        "%s aborts a run immediately before its runner microtask",
        async (action) => {
            const runner = vi.fn((_options, runOptions: StatsRunOptions) => {
                expect(runOptions.signal?.aborted).toBe(true);
                return Promise.reject(new Error("Aborted"));
            });
            const service = createStatsService({ cwd: "/workspace" }, runner);
            service.run();
            service[action]();
            await Promise.resolve();
            // A queued runner may execute, but must receive the captured aborted signal.
            if (runner.mock.calls.length)
                expect(runner.mock.calls[0]?.[1].signal?.aborted).toBe(true);
            await Promise.resolve();
            await Promise.resolve();
            expect(service.getStatus().status).not.toBe("failed");
            if (action === "cancel")
                expect(service.getStatus().status).toBe("cancelled");
            if (action === "invalidate")
                expect(service.getStatus().status).toBe("idle");
            if (action === "close")
                expect(() => service.run()).toThrow("session has closed");
            service.close();
        }
    );

    it.each(["cancel", "invalidate"] as const)(
        "%s discards stale results and progress without affecting the next run",
        async (action) => {
            const first = pendingReport();
            const second = pendingReport();
            const runner = vi
                .fn((_options, _runOptions: StatsRunOptions) => first.promise)
                .mockImplementationOnce(() => first.promise)
                .mockImplementationOnce(() => second.promise);
            const service = createStatsService({ cwd: "/workspace" }, runner);
            service.run();
            await Promise.resolve();
            const oldOptions = runner.mock.calls[0]?.[1];
            service[action]();
            expect(oldOptions?.signal?.aborted).toBe(true);
            service.run();
            await Promise.resolve();
            oldOptions?.onProgress?.({
                completedFiles: 999,
                discoveredFiles: 999,
            });
            first.resolve(report(true));
            await Promise.resolve();
            await Promise.resolve();
            expect(service.getStatus()).toMatchObject({
                status: "running",
                progress: { completedFiles: 0, discoveredFiles: 0 },
            });
            second.resolve(report());
            await vi.waitFor(() =>
                expect(service.getStatus().status).toBe("complete")
            );
            expect(service.getStatus().report?.partial).toBe(false);
            service.invalidate();
            expect(service.getStatus()).toEqual({
                status: "idle",
                progress: { completedFiles: 0, discoveredFiles: 0 },
            });
            service.close();
        }
    );

    it("exposes startup failure, permits retry, and retains partial reports", async () => {
        const runner = vi
            .fn()
            .mockRejectedValueOnce(new Error("Cannot load configuration"))
            .mockResolvedValueOnce(report(true));
        const service = createStatsService({ cwd: "/workspace" }, runner);
        service.run();
        await vi.waitFor(() =>
            expect(service.getStatus()).toMatchObject({
                status: "failed",
                error: "Cannot load configuration",
            })
        );
        service.run();
        expect(service.getStatus().error).toBeUndefined();
        await vi.waitFor(() =>
            expect(service.getStatus().status).toBe("partial")
        );
        expect(service.getStatus().report?.diagnostics).toEqual([
            "A file failed",
        ]);
        service.close();
    });

    it("ignores a late rejection after shutdown and rejects further runs", async () => {
        const pending = pendingReport();
        const runner = vi.fn(
            (_options, _runOptions: StatsRunOptions) => pending.promise
        );
        const service = createStatsService({ cwd: "/workspace" }, runner);
        service.run();
        await Promise.resolve();
        service.close();
        expect(runner.mock.calls[0]?.[1].signal?.aborted).toBe(true);
        pending.reject(new Error("Worker stopped"));
        await Promise.resolve();
        await Promise.resolve();
        expect(service.getStatus().error).toBeUndefined();
        expect(() => service.run()).toThrow("session has closed");
    });
});
