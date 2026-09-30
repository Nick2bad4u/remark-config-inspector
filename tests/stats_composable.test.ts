import type { StatsJob } from "../shared/stats";
import type { Payload } from "../shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { STATS_REPORT } from "./e2e/fixtures/stats";

const fetchMock = vi.fn<(...args: unknown[]) => Promise<StatsJob>>();
const payloadMock = ref<Payload>({
    configs: [],
    rules: {},
    meta: {
        basePath: "test",
        configPath: "test",
        lastUpdate: 1,
        statsAvailable: true,
    },
});
vi.mock("ofetch", () => ({ $fetch: fetchMock }));
vi.mock("#app/nuxt", () => ({
    useRuntimeConfig: () => ({ app: { baseURL: "/inspector/" } }),
}));
vi.mock("../app/composables/payload", () => ({ payload: payloadMock }));
const { useStats } = await import("../app/composables/stats");

const idle: StatsJob = {
    status: "idle",
    progress: { completedFiles: 0, discoveredFiles: 0 },
};
const running: StatsJob = {
    status: "running",
    progress: { completedFiles: 1, discoveredFiles: 2 },
};
const complete: StatsJob = {
    status: "complete",
    progress: { completedFiles: 2, discoveredFiles: 2 },
    report: STATS_REPORT,
};
let scope = effectScope();

describe("stats connection lifecycle", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(idle);
        payloadMock.value = {
            configs: [],
            rules: {},
            meta: {
                basePath: "test",
                configPath: "test",
                lastUpdate: payloadMock.value.meta.lastUpdate + 1,
                statsAvailable: true,
            },
        };
        scope = effectScope();
    });
    afterEach(() => {
        scope.stop();
        vi.useRealTimers();
    });

    it("polls only running jobs and stops when its view is disposed", async () => {
        fetchMock.mockResolvedValue(running);
        scope.run(useStats);
        await vi.advanceTimersByTimeAsync(1_500);
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock).toHaveBeenCalledWith("/api/stats/status", {
            baseURL: "/inspector/",
            method: "GET",
            retry: 0,
        });
        scope.stop();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("does not poll completed reports", async () => {
        fetchMock.mockResolvedValue(complete);
        const stats = scope.run(useStats)!;
        await vi.advanceTimersByTimeAsync(5_000);
        expect(stats.job.value.report).toEqual(STATS_REPORT);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("discards an in-flight response when config changes", async () => {
        let finishOldRequest: ((job: StatsJob) => void) | undefined;
        fetchMock.mockImplementationOnce(
            () =>
                new Promise<StatsJob>((resolve) => {
                    finishOldRequest = resolve;
                })
        );
        const stats = scope.run(useStats)!;
        payloadMock.value.meta.lastUpdate++;
        await nextTick();
        await vi.advanceTimersByTimeAsync(0);
        finishOldRequest?.(complete);
        await vi.advanceTimersByTimeAsync(0);
        expect(stats.job.value.status).toBe("idle");
        expect(stats.job.value.report).toBeUndefined();
        expect(stats.busy.value).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("loads saved reports with no requests and can recover a failed poll", async () => {
        payloadMock.value = {
            ...payloadMock.value,
            stats: STATS_REPORT,
            meta: { ...payloadMock.value.meta, statsAvailable: false },
        };
        const saved = scope.run(useStats)!;
        await saved.run();
        await saved.refresh();
        expect(saved.job.value.report).toEqual(STATS_REPORT);
        expect(fetchMock).not.toHaveBeenCalled();
        scope.stop();
        scope = effectScope();
        payloadMock.value.meta.statsAvailable = true;
        fetchMock.mockRejectedValueOnce(new Error("offline"));
        const live = scope.run(useStats)!;
        await vi.advanceTimersByTimeAsync(0);
        expect(live.connectionError.value).toBe("offline");
        await live.refresh();
        expect(live.connectionError.value).toBeUndefined();
        expect(live.job.value.status).toBe("idle");
    });
});
