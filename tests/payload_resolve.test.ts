import type { FilesGroup, Payload } from "../shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { DEFAULT_WORKSPACE_SCAN_GLOBS } from "../shared/configs";

const configsOpenStateMock = ref<boolean[]>([]);
const fileGroupsOpenStateMock = ref<boolean[]>([]);

vi.mock("../app/composables/state", () => ({
    configsOpenState: configsOpenStateMock,
    fileGroupsOpenState: fileGroupsOpenStateMock,
}));

vi.mock("~~/shared/configs", async () => await import("../shared/configs"));
vi.mock("~~/shared/rules", async () => await import("../shared/rules"));

const { resolvePayload } = await import("../app/composables/payload");

function createBasePayload(configCount = 1): Payload {
    return {
        meta: {
            lastUpdate: Date.now(),
            basePath: process.cwd(),
            configPath: ".remarkrc.mjs",
            engine: "remark",
        },
        configs: Array.from({ length: configCount }, (_, index) => ({
            index,
            rules: {},
        })),
        rules: {},
    };
}

describe("resolvePayload", () => {
    beforeEach(() => {
        configsOpenStateMock.value = [];
        fileGroupsOpenStateMock.value = [];
    });

    it("sets configs open state to expanded when there are fewer than ten configs", () => {
        const payload = createBasePayload(3);

        const resolved = resolvePayload(payload);

        expect(resolved.filesResolved).toBeUndefined();
        expect(configsOpenStateMock.value).toEqual([
            true,
            true,
            true,
        ]);
    });

    it("collapses config cards by default when there are ten or more configs", () => {
        const payload = createBasePayload(10);

        resolvePayload(payload);

        expect(configsOpenStateMock.value).toEqual(
            Array.from({ length: 10 }).fill(false)
        );
    });

    it("normalizes rule state levels, primary options, and tuple options", () => {
        const payload: Payload = {
            ...createBasePayload(1),
            configs: [
                {
                    index: 0,
                    rules: {
                        "remark-lint-final-newline": "always",
                        "remark-lint-maximum-line-length": [
                            true,
                            { severity: "warning" },
                            { ignore: ["comments"] },
                        ],
                        "remark-lint-no-dead-urls": false,
                    },
                },
            ],
        };

        const resolved = resolvePayload(payload);

        expect(resolved.ruleToState.get("remark-lint-final-newline")).toEqual([
            {
                name: "remark-lint-final-newline",
                configIndex: 0,
                level: "error",
                primaryOption: "always",
                options: undefined,
            },
        ]);

        expect(
            resolved.ruleToState.get("remark-lint-maximum-line-length")
        ).toEqual([
            {
                name: "remark-lint-maximum-line-length",
                configIndex: 0,
                level: "warn",
                primaryOption: true,
                options: [{ severity: "warning" }, { ignore: ["comments"] }],
            },
        ]);

        expect(resolved.ruleToState.get("remark-lint-no-dead-urls")).toEqual([
            {
                name: "remark-lint-no-dead-urls",
                configIndex: 0,
                level: "off",
                primaryOption: undefined,
                options: undefined,
            },
        ]);
    });

    it("normalizes rule metadata names to match payload rule keys", () => {
        const payload: Payload = {
            ...createBasePayload(1),
            configs: [
                {
                    index: 0,
                    rules: {
                        "remark-lint-correct-media-syntax": true,
                    },
                },
            ],
            rules: {
                "remark-lint-correct-media-syntax": {
                    name: "correct-media-syntax",
                    plugin: "remark-lint",
                },
            },
        };

        const resolved = resolvePayload(payload);

        expect(resolved.rules["remark-lint-correct-media-syntax"]?.name).toBe(
            "remark-lint-correct-media-syntax"
        );
        expect(
            resolved.ruleToState.get("remark-lint-correct-media-syntax")?.length
        ).toBe(1);
    });

    it("reconciles canonical rule state aliases when config uses short rule keys", () => {
        const payload: Payload = {
            ...createBasePayload(1),
            configs: [
                {
                    index: 0,
                    rules: {
                        "correct-media-syntax": true,
                    },
                },
            ],
            rules: {
                "remark-lint-correct-media-syntax": {
                    name: "remark-lint-correct-media-syntax",
                    plugin: "remark-lint",
                },
            },
        };

        const resolved = resolvePayload(payload);

        expect(
            resolved.ruleToState.get("remark-lint-correct-media-syntax")
        ).toEqual([
            {
                name: "remark-lint-correct-media-syntax",
                configIndex: 0,
                level: "error",
                primaryOption: true,
                options: undefined,
            },
        ]);
    });

    it("builds extends info and glob maps from config files and ignores", () => {
        const payload: Payload = {
            ...createBasePayload(2),
            configs: [
                {
                    index: 0,
                    files: ["docs/**/*.md"],
                    ignores: ["dist/**"],
                    rules: {},
                },
                {
                    index: 1,
                    files: ["docs/**/*.md", "packages/**/*.md"],
                    rules: {},
                },
            ],
            extendsInfo: [
                {
                    specifier: "remark-preset-lint-recommended",
                    source: "package",
                    ruleCount: 1,
                    rules: ["remark-lint-final-newline"],
                    usedByConfigIndexes: [0],
                },
            ],
        };

        const resolved = resolvePayload(payload);

        expect(
            resolved.extendsInfoMap.get("remark-preset-lint-recommended")
                ?.source
        ).toBe("package");
        expect(
            resolved.globToConfigs
                .get("docs/**/*.md")
                ?.map((config) => config.index)
        ).toEqual([0, 1]);
        expect(
            resolved.globToConfigs.get("dist/**")?.map((config) => config.index)
        ).toEqual([0]);
        expect(
            resolved.globToConfigs
                .get("packages/**/*.md")
                ?.map((config) => config.index)
        ).toEqual([1]);
    });

    it("creates matched, declared, and default file groups from payload files and config globs", () => {
        const payload: Payload = {
            ...createBasePayload(4),
            configs: [
                {
                    index: 0,
                    name: "general-root",
                    rules: {
                        "remark-lint-final-newline": "always",
                    },
                },
                {
                    index: 1,
                    name: "docs-markdown",
                    files: ["docs/**/*.md", "docs/unused/**/*.md"],
                    rules: {
                        "remark-lint-maximum-line-length": 80,
                    },
                },
                {
                    index: 2,
                    name: "ignore-only",
                    ignores: ["dist/**"],
                },
                {
                    index: 3,
                    name: "markdown-override",
                    files: ["packages/**/*.md"],
                    rules: {
                        "remark-lint-no-undefined-references": true,
                    },
                },
            ],
            files: [
                {
                    filepath: "docs/guide.md",
                    globs: ["docs/**/*.md", "!docs/excluded/**"],
                    configs: [0, 1],
                },
                {
                    filepath: "docs/other.md",
                    globs: ["docs/**/*.md"],
                    configs: [0, 1],
                },
                {
                    filepath: "docs/general.md",
                    globs: [],
                    configs: [0],
                },
            ],
        };

        const resolved = resolvePayload(payload);
        const filesResolved = resolved.filesResolved;

        expect(filesResolved).toBeDefined();

        if (!filesResolved) throw new Error("Expected filesResolved data");

        const groupsById = new Map<string, FilesGroup>(
            filesResolved.groups.map((group) => [group.id, group] as const)
        );

        expect(groupsById.get("configs:1")?.kind).toBe("matched");
        expect(groupsById.get("configs:1")?.files).toEqual([
            "docs/guide.md",
            "docs/other.md",
        ]);

        expect(groupsById.get("globs:<general>")?.kind).toBe("matched");
        expect(groupsById.get("globs:<general>")?.files).toEqual([
            "docs/general.md",
        ]);

        expect(groupsById.get("declared-glob:docs/unused/**/*.md")?.kind).toBe(
            "declared"
        );
        expect(groupsById.get("declared-glob:packages/**/*.md")?.kind).toBe(
            "declared"
        );

        const defaultGroup = groupsById.get(
            `default-scan:${DEFAULT_WORKSPACE_SCAN_GLOBS[0]}`
        );
        expect(defaultGroup?.kind).toBe("default");
        expect(defaultGroup?.configs.map((config) => config.index)).toEqual([
            0,
        ]);

        expect(
            filesResolved.fileToConfigs
                .get("docs/guide.md")
                ?.map((config) => config.index)
        ).toEqual([0, 1]);

        expect(fileGroupsOpenStateMock.value).toEqual(
            filesResolved.groups.map(() => true)
        );
    });

    it("does not create declared/default groups when those globs already have matched files", () => {
        const matchedDefaultGlob = DEFAULT_WORKSPACE_SCAN_GLOBS[0]!;
        const payload: Payload = {
            ...createBasePayload(3),
            configs: [
                {
                    index: 0,
                    name: "general-root",
                    rules: {
                        "remark-lint-final-newline": "always",
                    },
                },
                {
                    index: 1,
                    name: "declared-markdown",
                    files: ["docs/**/*.md"],
                    rules: {
                        "remark-lint-maximum-line-length": 80,
                    },
                },
                {
                    index: 2,
                    name: "ignore-only",
                    ignores: ["dist/**"],
                },
            ],
            files: [
                {
                    filepath: "docs/real.md",
                    globs: ["docs/**/*.md"],
                    configs: [0, 1],
                },
                {
                    filepath: "docs/scan-hit.md",
                    globs: [matchedDefaultGlob],
                    configs: [0],
                },
            ],
        };

        const resolved = resolvePayload(payload);
        const groupsById = new Map(
            (resolved.filesResolved?.groups ?? []).map(
                (group) => [group.id, group] as const
            )
        );

        expect(groupsById.has("declared-glob:docs/**/*.md")).toBe(false);
        expect(groupsById.has(`default-scan:${matchedDefaultGlob}`)).toBe(
            false
        );
    });
});
