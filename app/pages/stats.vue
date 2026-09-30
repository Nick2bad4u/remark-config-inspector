<script setup lang="ts">
import type { StatsView } from "~~/shared/stats-display";
import { computed, ref } from "vue";
import {
    statsMessageLabel,
    statsPhaseRows,
    statsRankingRows,
} from "~~/shared/stats-display";
import { useStats } from "~/composables/stats";

const { job, live, busy, connectionError, refresh, run, cancel } = useStats();
const view = ref<StatsView>("rules");
const search = ref("");
const sort = ref("duration-desc");
const views = [
    { id: "rules", label: "Slow Rules" },
    { id: "plugins", label: "Slow Plugins" },
    { id: "files", label: "Slow Files" },
    { id: "tasks", label: "Slow Tasks" },
] as const;
const report = computed(() => job.value.report);
const failedFiles = computed(
    () => report.value?.files.filter((file) => file.failed) ?? []
);
const phases = computed(() =>
    report.value
        ? statsPhaseRows(report.value.phases, report.value.durationMs)
        : []
);
const rows = computed(() => {
    if (!report.value) return [];
    const query = search.value.trim().toLowerCase();
    return statsRankingRows(report.value, view.value)
        .filter(
            (row) =>
                !query ||
                row.label.toLowerCase().includes(query) ||
                row.details.some((detail) =>
                    detail.label.toLowerCase().includes(query)
                )
        )
        .toSorted((left, right) => {
            if (sort.value === "name")
                return left.label.localeCompare(right.label);
            const delta = left.durationMs - right.durationMs;
            return (
                (sort.value === "duration-asc" ? delta : -delta) ||
                left.label.localeCompare(right.label)
            );
        });
});
const maxDuration = computed(() =>
    rows.value.reduce((maximum, row) => Math.max(maximum, row.durationMs), 0)
);
const timestamp = computed(() =>
    report.value ? new Date(report.value.createdAt).toLocaleString() : ""
);

function formatTime(value: number) {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ms`;
}

function percentage(value: number, total: number) {
    return total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
}
</script>

<template>
    <div class="stats-page">
        <InspectorPageHeader
            title="Stats"
            description="Find the rules, plugins, and Markdown files that take the most time to process."
        />
        <div class="stats-toolbar">
            <div class="stats-muted">
                Full-pipeline profiling · Parse, transform, and stringify
            </div>
            <div v-if="live" class="stats-actions">
                <button
                    v-if="job.status === 'running'"
                    type="button"
                    btn-action
                    :disabled="busy"
                    @click="cancel"
                >
                    Cancel
                </button>
                <button
                    v-else
                    type="button"
                    btn-action
                    :disabled="busy"
                    @click="run"
                >
                    {{ report ? "Re-run analysis" : "Run analysis" }}
                </button>
            </div>
            <span v-else class="stats-muted">Saved snapshot</span>
        </div>

        <div
            v-if="connectionError"
            role="alert"
            class="inspector-panel stats-notice"
        >
            <p>Could not reach the profiling service. {{ connectionError }}</p>
            <button type="button" btn-action :disabled="busy" @click="refresh">
                Retry connection
            </button>
        </div>
        <div
            v-if="job.status === 'running'"
            role="status"
            aria-label="Analysis status"
            class="inspector-panel stats-notice"
        >
            <p>
                Analyzing Markdown files… {{ job.progress.completedFiles }} /
                {{ job.progress.discoveredFiles }} completed
            </p>
            <progress
                :value="job.progress.completedFiles"
                :max="Math.max(1, job.progress.discoveredFiles)"
                aria-label="Analysis progress"
            />
            <p v-if="job.progress.currentFile" class="stats-path">
                {{ job.progress.currentFile }}
            </p>
        </div>
        <div
            v-else-if="job.status === 'failed'"
            role="alert"
            class="inspector-panel stats-notice"
        >
            <p>
                Analysis failed.
                {{
                    job.error ||
                    "Check your remark configuration and try again."
                }}
            </p>
        </div>
        <div
            v-else-if="job.status === 'cancelled'"
            role="status"
            aria-label="Analysis status"
            class="inspector-panel stats-notice"
        >
            <p>Analysis cancelled. Run a new analysis when you are ready.</p>
        </div>
        <div
            v-else-if="job.status === 'idle' && !report"
            class="inspector-panel stats-notice"
        >
            <template v-if="live">
                <h2>Explore processing performance</h2>
                <p>
                    Run an analysis to measure your workspace’s Markdown files
                    with their remark configurations. Generated Markdown stays
                    in memory.
                </p>
            </template>
            <template v-else>
                <h2>No stats in this snapshot</h2>
                <p>Generate a static inspector with profiling results:</p>
                <code>remark-config-inspector build --stats</code>
            </template>
        </div>

        <template v-if="report">
            <p class="stats-muted">
                {{ live ? "Last analysis" : "Snapshot captured" }}:
                <time :datetime="new Date(report.createdAt).toISOString()">{{
                    timestamp
                }}</time>
            </p>
            <div
                v-if="report.partial"
                role="alert"
                class="inspector-panel stats-notice"
            >
                <p>
                    Partial results: some files could not be processed.
                    Completed measurements are shown below.
                </p>
                <ul class="stats-failure-list">
                    <li v-for="file in failedFiles" :key="file.filePath">
                        <strong class="stats-path">{{ file.filePath }}</strong>
                        <ul
                            v-if="file.messages.length"
                            class="stats-file-messages"
                        >
                            <li
                                v-for="(message, index) in file.messages"
                                :key="index"
                            >
                                {{ statsMessageLabel(message) }}
                            </li>
                        </ul>
                        <p v-else>
                            Processing stopped before this file completed; no
                            diagnostic was provided.
                        </p>
                    </li>
                </ul>
            </div>
            <ul
                v-if="report.diagnostics.length"
                class="inspector-panel stats-diagnostics"
            >
                <li
                    v-for="(diagnostic, index) in report.diagnostics"
                    :key="index"
                >
                    {{ diagnostic }}
                </li>
            </ul>
            <dl class="stats-metrics">
                <div class="inspector-panel">
                    <dt>Processed files</dt>
                    <dd>{{ report.files.length }}</dd>
                </div>
                <div class="inspector-panel">
                    <dt>Errors</dt>
                    <dd>{{ report.errorCount }}</dd>
                </div>
                <div class="inspector-panel">
                    <dt>Warnings</dt>
                    <dd>{{ report.warningCount }}</dd>
                </div>
                <div class="inspector-panel">
                    <dt>Wall time</dt>
                    <dd>{{ formatTime(report.wallTimeMs) }}</dd>
                </div>
                <div class="inspector-panel">
                    <dt>Measured processing</dt>
                    <dd>{{ formatTime(report.durationMs) }}</dd>
                </div>
            </dl>
            <section
                class="inspector-panel stats-notice"
                aria-labelledby="stats-phases-heading"
            >
                <h2 id="stats-phases-heading">Processing phases</h2>
                <p class="stats-muted">
                    Measured processing is the sum of file durations. Wall time
                    covers the analysis as a whole. Elapsed timings include
                    asynchronous waits; parser extensions are included in Parse.
                </p>
                <div
                    v-for="phase in phases"
                    :key="phase.label"
                    class="stats-phase"
                >
                    <span>{{ phase.label }}</span>
                    <span class="stats-bar-track" aria-hidden="true"
                        ><span
                            class="stats-bar"
                            :style="{
                                width: `${percentage(phase.durationMs, report.durationMs)}%`,
                            }"
                    /></span>
                    <span class="stats-number">{{
                        formatTime(phase.durationMs)
                    }}</span>
                </div>
            </section>
            <div
                v-if="report.files.length === 0"
                role="status"
                aria-label="Analysis status"
                class="inspector-panel stats-notice"
            >
                No Markdown files were found. Check the base directory and
                ignore configuration.
            </div>
            <section
                v-else
                aria-label="Performance rankings"
                class="stats-rankings"
            >
                <div class="stats-toolbar">
                    <div
                        class="inspector-segmented-control stats-view-control"
                        role="group"
                        aria-label="Ranking view"
                    >
                        <button
                            v-for="item in views"
                            :key="item.id"
                            type="button"
                            btn-action
                            :class="{ 'btn-action-active': view === item.id }"
                            :aria-pressed="view === item.id"
                            @click="view = item.id"
                        >
                            {{ item.label }}
                        </button>
                    </div>
                    <div class="stats-actions">
                        <div class="stats-control">
                            <label for="stats-search">Search</label>
                            <input
                                id="stats-search"
                                v-model="search"
                                type="search"
                                placeholder="Filter names or files"
                            />
                        </div>
                        <div class="stats-control">
                            <label for="stats-sort">Sort</label>
                            <select id="stats-sort" v-model="sort">
                                <option value="duration-desc">
                                    Slowest first
                                </option>
                                <option value="duration-asc">
                                    Fastest first
                                </option>
                                <option value="name">Name</option>
                            </select>
                        </div>
                    </div>
                </div>
                <p class="stats-muted">
                    {{
                        view === "files"
                            ? "Expand a file to see its phase breakdown."
                            : "Only measured transformers are listed. Expand an entry for individual measurements."
                    }}
                </p>
                <div class="inspector-panel stats-table-scroll">
                    <table class="stats-table">
                        <caption class="sr-only">
                            {{
                                views.find((item) => item.id === view)?.label
                            }}
                        </caption>
                        <thead>
                            <tr>
                                <th scope="col">
                                    {{
                                        view === "files"
                                            ? "File"
                                            : view === "tasks"
                                              ? "File · Plugin"
                                              : view === "rules"
                                                ? "Rule"
                                                : "Plugin"
                                    }}
                                </th>
                                <th scope="col">Elapsed</th>
                                <th scope="col">
                                    {{
                                        view === "files"
                                            ? "Diagnostics"
                                            : "Invocations"
                                    }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in rows" :key="`${view}:${row.id}`">
                                <td>
                                    <details>
                                        <summary class="stats-path">
                                            {{ row.label }}
                                            <span
                                                v-if="row.failed"
                                                class="stats-failure"
                                            >
                                                — Failed</span
                                            >
                                        </summary>
                                        <ul class="stats-detail-list">
                                            <li
                                                v-for="(
                                                    detail, index
                                                ) in row.details"
                                                :key="index"
                                            >
                                                <span class="stats-path">{{
                                                    detail.label
                                                }}</span
                                                ><span class="stats-number">{{
                                                    formatTime(
                                                        detail.durationMs
                                                    )
                                                }}</span>
                                            </li>
                                        </ul>
                                        <ul
                                            v-if="row.diagnostics?.length"
                                            class="stats-file-messages"
                                            aria-label="File diagnostics"
                                        >
                                            <li
                                                v-for="(
                                                    diagnostic, index
                                                ) in row.diagnostics"
                                                :key="index"
                                            >
                                                {{ diagnostic }}
                                            </li>
                                        </ul>
                                    </details>
                                </td>
                                <td>
                                    <span class="stats-number">{{
                                        formatTime(row.durationMs)
                                    }}</span
                                    ><span
                                        class="stats-bar-track"
                                        aria-hidden="true"
                                        ><span
                                            class="stats-bar"
                                            :style="{
                                                width: `${percentage(row.durationMs, maxDuration)}%`,
                                            }"
                                    /></span>
                                </td>
                                <td class="stats-number">{{ row.count }}</td>
                            </tr>
                            <tr v-if="rows.length === 0">
                                <td colspan="3">
                                    {{
                                        search
                                            ? "No measurements match your search."
                                            : "No measured transformers in this view."
                                    }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
        </template>
    </div>
</template>

<style scoped>
.stats-page,
.stats-rankings {
    display: grid;
    gap: 1rem;
    min-inline-size: 0;
}
.stats-toolbar,
.stats-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
}
.stats-toolbar {
    justify-content: space-between;
}
.stats-muted,
dt {
    color: var(--inspector-muted);
}
.stats-notice {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    & h2 {
        font-weight: 600;
    }
    & code {
        overflow-wrap: anywhere;
    }
    & progress {
        inline-size: 100%;
        accent-color: var(--inspector-accent);
    }
}
.stats-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    & > div {
        flex: 1 1 10rem;
        min-inline-size: 0;
        padding: 1rem;
    }
    & dd {
        margin-block-start: 0.5rem;
        font-size: 1.25rem;
        font-weight: 600;
    }
}
.stats-phase {
    display: grid;
    grid-template-columns: [label] 7rem [bar] minmax(2rem, 1fr) [value] minmax(
            5rem,
            auto
        );
    gap: 0.75rem;
    align-items: center;
}
.stats-bar-track {
    display: block;
    block-size: 0.4rem;
    overflow: hidden;
    background: var(--inspector-accent-soft);
    border-radius: var(--inspector-radius);
}
.stats-bar {
    display: block;
    block-size: 100%;
    background: var(--inspector-accent);
}
.stats-number {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
}
.stats-view-control {
    flex-wrap: wrap;
}
.stats-control {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    & input,
    & select {
        min-inline-size: 0;
        max-inline-size: 100%;
        padding: 0.5rem;
        color: var(--inspector-text);
        background: var(--inspector-surface);
        border: 1px solid var(--inspector-border);
        border-radius: var(--inspector-radius);
    }
}
.stats-table-scroll {
    overflow-inline: auto;
}
.stats-table {
    inline-size: 100%;
    text-align: start;
    border-collapse: collapse;
    & th,
    & td {
        padding: 0.85rem;
        vertical-align: top;
        text-align: start;
        border-block-end: 1px solid var(--inspector-border);
    }
    & th {
        font-weight: 600;
        white-space: nowrap;
    }
    & th:not(:first-child) {
        inline-size: 1%;
    }
    & summary {
        cursor: pointer;
    }
    & td > .stats-bar-track {
        margin-block-start: 0.5rem;
    }
}
.stats-path {
    overflow-wrap: anywhere;
}
.stats-detail-list {
    display: grid;
    gap: 0.5rem;
    margin-block-start: 0.75rem;
    color: var(--inspector-muted);
    & li {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: space-between;
    }
}
.stats-diagnostics {
    padding: 1rem 1rem 1rem 2rem;
    overflow-wrap: anywhere;
    list-style: disc;
}
.stats-failure {
    font-weight: 600;
    color: var(--inspector-error);
}
.stats-failure-list,
.stats-file-messages {
    display: grid;
    gap: 0.5rem;
    overflow-wrap: anywhere;
}
.stats-file-messages {
    padding-inline-start: 1.25rem;
    margin-block-start: 0.75rem;
    list-style: disc;
}

@media (width <= 480px) {
    .stats-phase {
        grid-template-columns:
            [label] 6rem [bar] minmax(1rem, 1fr)
            [value] auto;
        gap: 0.5rem;
    }
}
</style>
