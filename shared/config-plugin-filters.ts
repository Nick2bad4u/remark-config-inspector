import type { FlatConfigItem } from "./types";

const FILE_EXTENSION_SUFFIX_RE = /\.[^.]+$/;
const REMARK_LINT_PACKAGE_PREFIX_RE = /^remark-lint-.+$/;
const SCOPED_REMARK_LINT_PACKAGE_RE = /^(@[^/]+)\/remark-lint(?:-(.+))?$/;
const REMARK_PRESET_LINT_PREFIX_RE = /^remark-preset-lint-.+$/;

function addScopedRemarkLintCandidates(
    candidates: Set<string>,
    scopedMatch: RegExpExecArray
): void {
    const scope = scopedMatch[1];
    const suffix = scopedMatch[2];

    if (typeof scope === "string" && scope.length > 0) {
        candidates.add(scope);
        candidates.add(`${scope}/remark-lint`);
    }

    candidates.add("remark-lint");

    if (
        typeof scope === "string" &&
        scope.length > 0 &&
        typeof suffix === "string" &&
        suffix.length > 0
    ) {
        candidates.add(`${scope}/${suffix}`);
    }

    if (typeof suffix === "string" && suffix.length > 0)
        candidates.add(suffix);
}

function addTailCandidates(candidates: Set<string>, trimmed: string): void {
    const tail = trimmed.split("/").at(-1);
    if (typeof tail !== "string" || tail.length === 0) return;

    candidates.add(tail);
    const tailWithoutExt = tail.replace(FILE_EXTENSION_SUFFIX_RE, "");
    if (tailWithoutExt.length > 0) candidates.add(tailWithoutExt);

    if (REMARK_LINT_PACKAGE_PREFIX_RE.test(tailWithoutExt))
        candidates.add("remark-lint");

    if (REMARK_PRESET_LINT_PREFIX_RE.test(tailWithoutExt)) {
        candidates.add("remark-preset-lint");
        candidates.add("remark-lint");
    }
}

function normalizePluginSet(plugins: Iterable<string>): Set<string> {
    return new Set(
        [...plugins].filter(
            (plugin): plugin is string =>
                typeof plugin === "string" && plugin.length > 0
        )
    );
}

export function getRulePluginName(ruleName: string): string {
    if (ruleName.startsWith("remark-lint-")) return "remark-lint";

    const segments = ruleName.split("/").filter(Boolean);
    if (!segments.length || segments.length === 1) return "";

    if (segments[0]?.startsWith("@") === true) {
        const scope = segments[0];
        if (segments.length >= 3) {
            const plugin = segments[1];

            return typeof plugin === "string" && plugin.length > 0
                ? `${scope}/${plugin}`
                : (scope ?? "");
        }

        return scope ?? "";
    }

    return segments[0] ?? "";
}

export function getConfigRulePlugins(
    config: Pick<FlatConfigItem, "rules">
): Set<string> {
    const rules = config.rules;
    if (!rules) return new Set<string>();

    return new Set(
        Object.keys(rules)
            .map((name) => getRulePluginName(name))
            .filter(Boolean)
    );
}

export function toPluginFilterCandidates(name: string): string[] {
    const trimmed = name.trim();
    if (trimmed.length === 0) return [];

    const candidates = new Set<string>([trimmed]);

    const scopedRemarkLintMatch = SCOPED_REMARK_LINT_PACKAGE_RE.exec(trimmed);
    if (scopedRemarkLintMatch)
        addScopedRemarkLintCandidates(candidates, scopedRemarkLintMatch);

    if (REMARK_LINT_PACKAGE_PREFIX_RE.test(trimmed))
        candidates.add("remark-lint");

    if (REMARK_PRESET_LINT_PREFIX_RE.test(trimmed)) {
        candidates.add("remark-preset-lint");
        candidates.add("remark-lint");
    }

    addTailCandidates(candidates, trimmed);

    return [...candidates];
}

export function resolveConfigPluginFilter(
    name: string,
    knownRulePlugins: Iterable<string>,
    configRulePlugins: Iterable<string> = []
): string {
    const availablePlugins = normalizePluginSet(knownRulePlugins);
    const configPlugins = normalizePluginSet(configRulePlugins);
    const candidates = toPluginFilterCandidates(name);

    for (const candidate of candidates) {
        if (availablePlugins.has(candidate)) return candidate;
    }

    for (const candidate of candidates) {
        for (const configPlugin of configPlugins) {
            if (
                candidate === configPlugin ||
                candidate.endsWith(`/${configPlugin}`) ||
                candidate.endsWith(`-${configPlugin}`)
            ) {
                return configPlugin;
            }
        }
    }

    return "";
}

export function getConfigPluginFilters(
    config: FlatConfigItem,
    knownRulePlugins: Iterable<string>
): string[] {
    const filters = new Set<string>();
    const configRulePlugins = getConfigRulePlugins(config);

    for (const configRulePlugin of configRulePlugins)
        filters.add(configRulePlugin);

    for (const pluginName of Object.keys(config.plugins ?? {})) {
        const filter = resolveConfigPluginFilter(
            pluginName,
            knownRulePlugins,
            configRulePlugins
        );
        if (filter.length > 0) filters.add(filter);
    }

    return [...filters].toSorted((left, right) => left.localeCompare(right));
}

export function configMatchesPluginFilters(
    config: FlatConfigItem,
    selectedPlugins: readonly string[],
    knownRulePlugins: Iterable<string>
): boolean {
    if (!selectedPlugins.length) return true;

    const configPlugins = new Set(
        getConfigPluginFilters(config, knownRulePlugins)
    );
    return selectedPlugins.some((selectedPlugin) =>
        configPlugins.has(selectedPlugin)
    );
}

export function ruleMatchesPluginFilters(
    ruleName: string,
    selectedPlugins: readonly string[]
): boolean {
    if (!selectedPlugins.length) return true;

    const rulePluginName = getRulePluginName(ruleName);
    return selectedPlugins.includes(rulePluginName);
}

export function configMatchesRulePluginFilters(
    config: Pick<FlatConfigItem, "rules">,
    selectedPlugins: readonly string[]
): boolean {
    if (!selectedPlugins.length) return true;

    const configRulePlugins = getConfigRulePlugins(config);
    return selectedPlugins.some((selectedPlugin) =>
        configRulePlugins.has(selectedPlugin)
    );
}
