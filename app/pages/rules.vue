<script setup lang="ts">
import type { RuleStatusFilter } from "~/composables/state";
import { debouncedWatch } from "@vueuse/core";
import Fuse from "fuse.js";
import { computed, ref, useId, watch, watchEffect } from "vue";
import { isRuleConfigured, isRuleEnabled } from "~~/shared/rules";
import { getPluginColor } from "~/composables/color";
import { payload } from "~/composables/payload";
import {
    filtersRules as filters,
    isGridView,
    stateStorage,
} from "~/composables/state";

const rules = computed(() => Object.values(payload.value.rules));
const listColumns =
    "56px_minmax(14rem,clamp(14rem,38vw,30rem))_5.25rem_minmax(0,1fr)";

const isPluginFilterPanelExpanded = ref(false);
const pluginFilterPanelId = useId();

function resolveRulePluginPackage(rule: (typeof rules.value)[number]): string {
    if (
        typeof rule.pluginPackageName === "string" &&
        rule.pluginPackageName.length > 0
    ) {
        return rule.pluginPackageName;
    }

    if (typeof rule.plugin === "string" && rule.plugin.length > 0)
        return rule.plugin;

    return rule.name;
}

const pluginNames = computed<string[]>(() => {
    return [
        ...new Set(rules.value.map((rule) => resolveRulePluginPackage(rule))),
    ].filter(
        (plugin): plugin is string =>
            typeof plugin === "string" && plugin.length > 0
    );
});

const pluginOptions = computed(() => {
    return pluginNames.value.map((plugin) => ({
        value: plugin,
        title: plugin,
        style: {
            "--plugin-color": getPluginColor(plugin),
            "--plugin-border-color": getPluginColor(plugin, 0.55),
            "--plugin-bg-color": getPluginColor(plugin, 0.1),
        },
    }));
});

const selectedPlugins = computed({
    get: () => filters.plugins,
    set: (value: string[]) => {
        filters.plugins = [...new Set(value)].toSorted((left, right) =>
            left.localeCompare(right)
        );
    },
});

const hasSelectedPlugin = computed(() => selectedPlugins.value.length > 0);
const shouldShowPluginFilterChips = computed(
    () => isPluginFilterPanelExpanded.value || hasSelectedPlugin.value
);

const isPluginSelected = (pluginName: string): boolean =>
    selectedPlugins.value.includes(pluginName);

function togglePluginSelection(pluginName: string): void {
    const nextSelection = new Set(selectedPlugins.value);

    if (nextSelection.has(pluginName)) nextSelection.delete(pluginName);
    else nextSelection.add(pluginName);

    selectedPlugins.value = [...nextSelection];
}

function clearPluginSelection(): void {
    selectedPlugins.value = [];
}

function togglePluginFilterPanel(): void {
    isPluginFilterPanelExpanded.value = !isPluginFilterPanelExpanded.value;
}

watchEffect(() => {
    const availablePlugins = new Set(pluginNames.value);
    const normalizedPlugins = selectedPlugins.value.filter((plugin) =>
        availablePlugins.has(plugin)
    );

    if (normalizedPlugins.length !== selectedPlugins.value.length)
        selectedPlugins.value = normalizedPlugins;
});
const hasGeneratedDescriptions = computed(() =>
    rules.value.some(
        (rule) =>
            rule.docs?.descriptionSource === "generated" ||
            !!rule.docs?.descriptionMissing
    )
);
const descriptionsNoticeText =
    "Descriptions are best-effort: remark-lint and many plugins do not ship consistent rule description metadata. Chat icon = message-derived, asterisk = generated fallback.";

function hasAnyRuleState(ruleName: string): boolean {
    return (payload.value.ruleToState.get(ruleName)?.length ?? 0) > 0;
}

function isConfiguredRule(ruleName: string): boolean {
    return isRuleConfigured(payload.value.ruleToState.get(ruleName));
}

function hasEnabledRuleState(ruleName: string): boolean {
    return isRuleEnabled(payload.value.ruleToState.get(ruleName));
}

function getRuleRowClass(ruleName: string): string {
    if (!stateStorage.dimDisabledRules) return "";

    if (!hasAnyRuleState(ruleName) && filters.state !== "unused") return "op42";

    if (hasAnyRuleState(ruleName) && !hasEnabledRuleState(ruleName))
        return "rule-muted-off";

    return "";
}

const usingRulesCount = computed(
    () => rules.value.filter((rule) => isConfiguredRule(rule.name)).length
);
const unusedRulesCount = computed(
    () => rules.value.filter((rule) => !isConfiguredRule(rule.name)).length
);
const recommendedRulesCount = computed(
    () => rules.value.filter((rule) => !!rule.docs?.recommended).length
);
const deprecatedRulesCount = computed(
    () => rules.value.filter((rule) => !!rule.deprecated).length
);
const STATUS_FILTER_META = {
    "": {
        title: "All",
        tooltip: "Show every rule status",
    },
    active: {
        title: "Active",
        tooltip: "Rules that are enabled in at least one matched config item",
    },
    recommended: {
        title: "Recommended",
        tooltip: "Rules included by a recognized recommended remark preset",
    },
    fixable: {
        title: "Fixable",
        tooltip: "Rules that support automatic fixes",
    },
    deprecated: {
        title: "Deprecated",
        tooltip: "Rules marked as deprecated by installed package metadata",
    },
} as const satisfies Record<
    RuleStatusFilter,
    {
        title: string;
        tooltip: string;
    }
>;
const statusFilterOptions = computed<RuleStatusFilter[]>(() => [
    "",
    "active",
    ...(recommendedRulesCount.value > 0
        ? (["recommended"] as const)
        : ([] as const)),
    "fixable",
    ...(deprecatedRulesCount.value > 0
        ? (["deprecated"] as const)
        : ([] as const)),
]);
const statusFilterTitles = computed(() =>
    statusFilterOptions.value.map((option) => STATUS_FILTER_META[option].title)
);
const statusFilterTooltips = computed(() =>
    statusFilterOptions.value.map(
        (option) => STATUS_FILTER_META[option].tooltip
    )
);
const selectedRuleName = ref("");
const selectedRule = computed(() =>
    selectedRuleName.value
        ? payload.value.rules[selectedRuleName.value]
        : undefined
);
const selectedRuleStates = computed(() =>
    selectedRuleName.value
        ? (payload.value.ruleToState.get(selectedRuleName.value) ?? [])
        : []
);
const selectedRuleFinalState = computed(() => {
    return (
        selectedRuleStates.value
            .toReversed()
            .find((state) => state.level !== "off") ??
        selectedRuleStates.value.at(-1)
    );
});

const conditionalFiltered = computed(() => {
    let conditional = rules.value;

    if (hasSelectedPlugin.value) {
        conditional = conditional.filter((rule) => {
            const pluginPackage = resolveRulePluginPackage(rule);
            const pluginCandidate =
                typeof rule.plugin === "string" && rule.plugin.length > 0
                    ? rule.plugin
                    : "";
            const candidates = new Set<string>(
                [
                    pluginPackage,
                    pluginCandidate,
                    rule.name,
                ].filter(Boolean)
            );

            return selectedPlugins.value.some((selectedPlugin) =>
                candidates.has(selectedPlugin)
            );
        });
    }

    if (filters.fixable != null) {
        conditional = conditional.filter(
            (rule) => !!rule.fixable === filters.fixable
        );
    }

    switch (filters.state) {
        case "using":
            conditional = conditional.filter((rule) =>
                isConfiguredRule(rule.name)
            );
            break;
        case "unused":
            conditional = conditional.filter(
                (rule) => !isConfiguredRule(rule.name)
            );
            break;
        case "overloads":
            conditional = conditional.filter(
                (rule) =>
                    (payload.value.ruleToState.get(rule.name)?.length || 0) > 1
            );
            break;
        case "error":
            conditional = conditional.filter((rule) =>
                payload.value.ruleToState
                    .get(rule.name)
                    ?.some((i) => i.level === "error")
            );
            break;
        case "warn":
            conditional = conditional.filter((rule) =>
                payload.value.ruleToState
                    .get(rule.name)
                    ?.some((i) => i.level === "warn")
            );
            break;
        case "off":
            conditional = conditional.filter((rule) =>
                payload.value.ruleToState
                    .get(rule.name)
                    ?.some((i) => i.level === "off")
            );
            break;
        case "off-only":
            conditional = conditional.filter((rule) => {
                const states = payload.value.ruleToState.get(rule.name);
                if (!states?.length) return false;
                return states.every((i) => i.level === "off");
            });
            break;
    }

    switch (filters.status) {
        case "active":
            conditional = conditional.filter((rule) =>
                hasEnabledRuleState(rule.name)
            );
            break;
        case "recommended":
            conditional = conditional.filter((rule) => rule.docs?.recommended);
            break;
        case "fixable":
            conditional = conditional.filter((rule) => rule.fixable);
            break;
        case "deprecated":
            conditional = conditional.filter((rule) => rule.deprecated);
            break;
    }

    return conditional;
});

const fuse = computed(
    () =>
        new Fuse(conditionalFiltered.value, {
            keys: ["name", "docs.description"],
            threshold: 0.5,
        })
);

const filtered = ref(conditionalFiltered.value);

if (
    !filters.search &&
    !hasSelectedPlugin.value &&
    filters.state === "using" &&
    filters.status === "active"
) {
    filters.status = "";
}

watch(
    () => filters.status,
    (status) => {
        if (status === "recommended" && filters.state === "using")
            filters.state = "";
    }
);

watch(statusFilterOptions, (options) => {
    if (filters.status && !options.includes(filters.status))
        filters.status = "";
});

watch(
    () => filters.state,
    (state) => {
        if (state === "unused" && filters.status === "active")
            filters.status = "";
    }
);

debouncedWatch(
    () => [filters.search, conditionalFiltered.value],
    () => {
        if (!filters.search) {
            filtered.value = conditionalFiltered.value;
            return;
        }
        filtered.value = fuse.value.search(filters.search).map((i) => i.item);
    },
    { debounce: 200 }
);
const isDefaultFilters = computed(
    () =>
        !(
            filters.search ||
            hasSelectedPlugin.value ||
            filters.state !== "using" ||
            filters.status
        )
);

function resetFilters() {
    filters.search = "";
    clearPluginSelection();
    filters.state = "using";
    filters.status = "";
}

function setRulesViewMode(mode: "list" | "grid"): void {
    isGridView.value = mode === "grid";
}

function selectRule(ruleName: string): void {
    selectedRuleName.value =
        selectedRuleName.value === ruleName ? "" : ruleName;
}
</script>

<template>
    <div>
        <div py4 flex="~ col gap-2">
            <div relative flex>
                <input
                    v-model="filters.search"
                    :class="filters.search ? 'font-mono' : ''"
                    placeholder="Search rules..."
                    aria-label="Search rules"
                    class="inspector-input"
                    border="~ base rounded-full"
                    w-full
                    bg-transparent
                    px3
                    py2
                    pl10
                    outline-none
                />
                <div
                    absolute
                    bottom-0
                    left-0
                    top-0
                    flex="~ items-center justify-center"
                    p4
                    op50
                >
                    <div i-ph-magnifying-glass-duotone />
                </div>
            </div>
            <div grid="~ cols-[max-content_1fr] gap-2" my2 items-center>
                <div text-right text-sm op50>Plugins</div>
                <div class="space-y-2">
                    <div flex="~ items-center gap-2 wrap">
                        <div
                            class="text-xs text-zinc-600 font-semibold tracking-wide uppercase dark:text-zinc-300/85"
                        >
                            Plugin packages
                        </div>
                        <button
                            type="button"
                            class="inspector-toggle-button px-2.5 py-0.5 text-xs"
                            :aria-controls="pluginFilterPanelId"
                            :aria-expanded="shouldShowPluginFilterChips"
                            @click="togglePluginFilterPanel"
                        >
                            <span
                                :class="
                                    shouldShowPluginFilterChips
                                        ? 'i-ph-caret-down-duotone'
                                        : 'i-ph-caret-right-duotone'
                                "
                            />
                            <span>
                                {{
                                    shouldShowPluginFilterChips
                                        ? "Hide plugin filters"
                                        : `Show plugin filters (${pluginOptions.length})`
                                }}
                            </span>
                        </button>
                    </div>

                    <div
                        v-if="shouldShowPluginFilterChips"
                        :id="pluginFilterPanelId"
                        class="flex flex-wrap items-center gap-2"
                    >
                        <button
                            type="button"
                            :aria-pressed="!hasSelectedPlugin"
                            class="plugin-filter-button badge px-2 py-0.5 text-xs transition"
                            @click="clearPluginSelection"
                        >
                            All plugins
                        </button>

                        <button
                            v-for="pluginOption in pluginOptions"
                            :key="pluginOption.value"
                            type="button"
                            :aria-pressed="isPluginSelected(pluginOption.value)"
                            class="plugin-filter-button badge px-2 py-0.5 text-xs transition"
                            :class="[
                                !isPluginSelected(pluginOption.value) &&
                                hasSelectedPlugin
                                    ? 'bg-white/65 text-zinc-700 opacity-75 hover:opacity-100 dark:bg-zinc-900/30 dark:text-zinc-300 dark:opacity-70 dark:hover:opacity-100'
                                    : '',
                            ]"
                            :style="pluginOption.style"
                            @click="togglePluginSelection(pluginOption.value)"
                        >
                            {{ pluginOption.title }}
                        </button>
                    </div>
                </div>
                <div text-right text-sm op50>State</div>
                <OptionSelectGroup
                    v-model="filters.state"
                    label="Rule state filter"
                    :options="[
                        '',
                        'using',
                        'unused',
                        'error',
                        'warn',
                        'off',
                        'overloads',
                        'off-only',
                    ]"
                    :titles="[
                        'All',
                        'Using',
                        'Unused',
                        'Error',
                        'Warn',
                        'Off',
                        'Overloaded',
                        'Off Only',
                    ]"
                    :tooltips="[
                        'Show every rule',
                        'Rules currently active in at least one config block',
                        'Rules currently disabled in all config blocks',
                        'Rules with effective error severity',
                        'Rules with effective warning severity',
                        'Rules set to off',
                        'Rules with mixed state across overrides',
                        'Rules explicitly off and never active',
                    ]"
                >
                    <template #default="{ value, title }">
                        <div class="flex items-center">
                            <div ml--1 mr-1 flex items-center>
                                <RuleLevelIcon
                                    v-if="
                                        value === 'error' ||
                                        value === 'overloads'
                                    "
                                    level="error"
                                />
                                <RuleLevelIcon
                                    v-if="
                                        value === 'warn' ||
                                        value === 'overloads'
                                    "
                                    level="warn"
                                />
                                <RuleLevelIcon
                                    v-if="
                                        value === 'off' ||
                                        value === 'off-only' ||
                                        value === 'overloads'
                                    "
                                    level="off"
                                />
                            </div>
                            {{ title || value }}
                        </div>
                    </template>
                </OptionSelectGroup>
                <div text-right text-sm op50>Status</div>
                <OptionSelectGroup
                    v-model="filters.status"
                    label="Rule status filter"
                    :options="statusFilterOptions"
                    :titles="statusFilterTitles"
                    :tooltips="statusFilterTooltips"
                >
                    <template #default="{ value, title }">
                        <div flex items-center gap-1>
                            <div
                                v-if="value === 'recommended'"
                                i-ph-check-square-duotone
                                ml--0.5
                                text-green
                            />
                            <div
                                v-if="value === 'fixable'"
                                i-ph-wrench-duotone
                                ml--0.5
                                text-amber
                            />
                            <div
                                v-if="value === 'deprecated'"
                                i-ph-prohibit-inset-duotone
                                ml--1
                                text-gray
                            />
                            {{ title || value }}
                        </div>
                    </template>
                </OptionSelectGroup>
            </div>
        </div>

        <div items-center justify-between gap-2 md:flex>
            <div flex="~ gap-2" lt-sm:flex-col>
                <div
                    class="inspector-summary-pill inspector-summary-pill--accent"
                    flex="~ inline gap-2 items-center"
                    px3
                    py1
                >
                    <div i-ph-list-checks-duotone />
                    <span>{{ filtered.length }}</span>
                    <span op75
                        >rules
                        {{ isDefaultFilters ? "in use" : "filtered" }}</span
                    >
                    <span text-sm op50>out of {{ rules.length }} rules</span>
                </div>
                <div
                    class="inspector-summary-pill"
                    flex="~ inline gap-2 items-center"
                    px3
                    py1
                    text-sm
                >
                    <span op70>Using</span>
                    <span font-mono>{{ usingRulesCount }}</span>
                    <span op40>•</span>
                    <span op70>Unused</span>
                    <span font-mono>{{ unusedRulesCount }}</span>
                    <span op40>•</span>
                    <span op70>Recommended</span>
                    <span font-mono>{{ recommendedRulesCount }}</span>
                    <div
                        v-if="hasGeneratedDescriptions"
                        v-tooltip="descriptionsNoticeText"
                        i-ph-info-duotone
                        text-red4
                        op70
                    />
                </div>
                <button
                    v-if="!isDefaultFilters"
                    type="button"
                    class="inspector-summary-pill inspector-summary-pill--accent"
                    flex="~ inline gap-2 items-center self-start"
                    px3
                    py1
                    @click="resetFilters()"
                >
                    <div i-ph-funnel-duotone text-red3 />
                    <span op50>Clear Filter</span>
                    <div i-ph-x ml--1 text-sm op25 hover:op100 />
                </button>
            </div>

            <div flex="~ gap-1">
                <button
                    type="button"
                    btn-action
                    :aria-pressed="!isGridView"
                    :class="{
                        'btn-action-active': !isGridView,
                    }"
                    @click="setRulesViewMode('list')"
                >
                    <div i-ph-list-duotone />
                    List
                </button>
                <button
                    type="button"
                    btn-action
                    :aria-pressed="isGridView"
                    :class="{
                        'btn-action-active': isGridView,
                    }"
                    @click="setRulesViewMode('grid')"
                >
                    <div i-ph-grid-four-duotone />
                    Grid
                </button>
            </div>
        </div>
        <div
            v-if="selectedRule"
            class="inspector-panel"
            border="~ red/20 rounded-lg"
            my4
            bg-red:5
            p4
        >
            <div flex="~ gap-3 items-start justify-between">
                <div min-w-0>
                    <div flex="~ gap-2 items-center wrap">
                        <div i-ph-path-duotone text-red4 />
                        <span font-medium>Effective rule trace</span>
                        <ColorizedRuleName
                            :name="selectedRule.name"
                            :prefix="selectedRule.plugin"
                            :deprecated="selectedRule.deprecated"
                            :borderless="true"
                        />
                    </div>
                    <div mt2 text-sm op70>
                        Ordered states explain why this rule is currently
                        {{
                            selectedRuleFinalState
                                ? `set to ${selectedRuleFinalState.level}`
                                : "not configured"
                        }}.
                    </div>
                </div>
                <button
                    btn-action
                    type="button"
                    aria-label="Close effective rule trace"
                    @click="selectedRuleName = ''"
                >
                    <div i-ph-x-duotone />
                    Close
                </button>
            </div>
            <div v-if="selectedRuleStates.length" mt3 flex="~ col gap-2">
                <RuleStateItem
                    v-for="(state, index) in selectedRuleStates"
                    :key="`${state.configIndex}-${state.level}-${index}`"
                    border="~ base rounded-lg"
                    bg-black:4
                    :state="state"
                />
            </div>
            <div v-else mt3 rounded border="~ base" bg-black:4 p3 text-sm op70>
                No config item currently sets this rule.
            </div>
        </div>
        <div v-if="!filtered.length" class="inspector-empty-state" my4>
            <div flex="~ gap-2 items-center" text-amber4>
                <div i-ph-funnel-x-duotone />
                <span font-medium>No rules match the active filters</span>
            </div>
            <div mt2 text-sm op75>
                Adjust the search, plugin, state, or status filters to broaden
                the rule set.
            </div>
            <button
                v-if="!isDefaultFilters"
                mt3
                btn-action
                type="button"
                @click="resetFilters()"
            >
                <div i-ph-arrow-counter-clockwise-duotone />
                Reset rule filters
            </button>
        </div>
        <RuleList
            v-else
            my4
            :grid-view="isGridView"
            :rules="filtered"
            :list-columns="listColumns"
            :dim-disabled="stateStorage.dimDisabledRules"
            :get-bind="(name: string) => ({ class: getRuleRowClass(name) })"
            @rule-select="selectRule"
        />
    </div>
</template>
