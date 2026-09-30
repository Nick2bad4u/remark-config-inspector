import type { StatsJob } from "~~/shared/stats";
import { $fetch } from "ofetch";
import { computed, onScopeDispose, ref, watch } from "vue";
import { useRuntimeConfig } from "#app/nuxt";
import { payload } from "./payload";

const job = ref<StatsJob>({
    status: "idle",
    progress: { completedFiles: 0, discoveredFiles: 0 },
});
let lastUpdate: number | undefined;

/** Reconnect on navigation; never contact live endpoints for a static snapshot. */
export function useStats() {
    const config = useRuntimeConfig();
    const live = computed(() => payload.value.meta.statsAvailable === true);
    const busy = ref(false);
    const connectionError = ref<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    let disposed = false;

    function stopPolling() {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
    }

    async function request(
        action:
            | "status"
            | "run"
            | "cancel"
    ) {
        if (disposed || !live.value || busy.value) return;
        stopPolling();
        const currentGeneration = generation;
        busy.value = true;
        connectionError.value = undefined;
        try {
            const result = await $fetch<StatsJob>(`/api/stats/${action}`, {
                baseURL: config.app.baseURL,
                method: action === "status" ? "GET" : "POST",
                retry: 0,
            });
            if (!disposed && currentGeneration === generation)
                job.value = result;
        } catch (error) {
            if (!disposed && currentGeneration === generation)
                connectionError.value =
                    error instanceof Error
                        ? error.message
                        : "Unable to connect to the profiling service.";
        } finally {
            if (!disposed && currentGeneration === generation) {
                busy.value = false;
                if (job.value.status === "running")
                    timer = setTimeout(() => void request("status"), 750);
            }
        }
    }

    watch(
        () => [payload.value.meta.lastUpdate, live.value] as const,
        ([updated]) => {
            generation++;
            busy.value = false;
            stopPolling();
            connectionError.value = undefined;
            if (!live.value) {
                const report = payload.value.stats;
                job.value = report
                    ? {
                          status: report.partial ? "partial" : "complete",
                          progress: {
                              completedFiles: report.files.length,
                              discoveredFiles: report.files.length,
                          },
                          report,
                      }
                    : {
                          status: "idle",
                          progress: { completedFiles: 0, discoveredFiles: 0 },
                      };
            } else {
                if (lastUpdate !== updated)
                    job.value = {
                        status: "idle",
                        progress: { completedFiles: 0, discoveredFiles: 0 },
                    };
                void request("status");
            }
            lastUpdate = updated;
        },
        { immediate: true }
    );

    onScopeDispose(() => {
        disposed = true;
        generation++;
        stopPolling();
    });

    return {
        job,
        live,
        busy,
        connectionError,
        refresh: () => request("status"),
        run: () => request("run"),
        cancel: () => request("cancel"),
    };
}
