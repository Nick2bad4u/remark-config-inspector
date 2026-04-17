import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeCliInspectorOptions } from "../src/cli-options";
import { DEFAULT_TARGET_FILE } from "../src/constants";

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("normalizeCliInspectorOptions", () => {
    it("uses the synthetic default target when no target input is provided", () => {
        expect(normalizeCliInspectorOptions({}).target).toBe(
            DEFAULT_TARGET_FILE
        );
    });

    it("treats --file as an alias for --target", () => {
        expect(
            normalizeCliInspectorOptions({
                file: "docs/readme.md",
            }).target
        ).toBe("docs/readme.md");
    });

    it("keeps explicit target over file alias input", () => {
        expect(
            normalizeCliInspectorOptions({
                target: "docs/explicit.md",
                file: "docs/alias.md",
            }).target
        ).toBe("docs/explicit.md");
    });

    it("uses remark env vars when CLI values are absent", () => {
        vi.stubEnv("REMARK_CONFIG", ".remarkrc.mjs");
        vi.stubEnv("REMARK_BASE_PATH", "packages/docs");
        vi.stubEnv("REMARK_TARGET", "docs/env.md");

        expect(normalizeCliInspectorOptions({})).toMatchObject({
            config: ".remarkrc.mjs",
            basePath: "packages/docs",
            target: "docs/env.md",
        });
    });

    it("prefers CLI file over env target fallback", () => {
        vi.stubEnv("REMARK_TARGET", "docs/from-env.md");

        expect(
            normalizeCliInspectorOptions({
                file: "docs/from-file.md",
            }).target
        ).toBe("docs/from-file.md");
    });

    it("supports legacy ESLint env vars for compatibility", () => {
        vi.stubEnv("ESLINT_TARGET", "docs/legacy.md");

        expect(normalizeCliInspectorOptions({}).target).toBe("docs/legacy.md");
    });

    it("falls back to legacy eslint env var when primary remark env var is empty", () => {
        vi.stubEnv("REMARK_TARGET", "");
        vi.stubEnv("ESLINT_TARGET", "docs/eslint-fallback.md");

        expect(normalizeCliInspectorOptions({}).target).toBe(
            "docs/eslint-fallback.md"
        );
    });

    it("keeps explicit target even when env vars for config/basePath are present", () => {
        vi.stubEnv("REMARK_CONFIG", ".remarkrc.mjs");
        vi.stubEnv("REMARK_BASE_PATH", "packages/docs");
        vi.stubEnv("REMARK_TARGET", "docs/env.md");

        const normalized = normalizeCliInspectorOptions({
            target: "docs/explicit.md",
        });

        expect(normalized.target).toBe("docs/explicit.md");
        expect(normalized.config).toBe(".remarkrc.mjs");
        expect(normalized.basePath).toBe("packages/docs");
    });

    it("keeps explicit config/basePath values over env fallbacks", () => {
        vi.stubEnv("REMARK_CONFIG", ".remarkrc.from-env.mjs");
        vi.stubEnv("REMARK_BASE_PATH", "packages/from-env");

        const normalized = normalizeCliInspectorOptions({
            config: ".remarkrc.explicit.mjs",
            basePath: "packages/explicit",
        });

        expect(normalized.config).toBe(".remarkrc.explicit.mjs");
        expect(normalized.basePath).toBe("packages/explicit");
    });

    it("falls back to legacy eslint config/basePath env vars when primary vars are empty", () => {
        vi.stubEnv("REMARK_CONFIG", "");
        vi.stubEnv("ESLINT_CONFIG", "eslint.compat.config.mjs");
        vi.stubEnv("REMARK_BASE_PATH", "");
        vi.stubEnv("ESLINT_BASE_PATH", "packages/eslint-legacy");

        const normalized = normalizeCliInspectorOptions({});

        expect(normalized.config).toBe("eslint.compat.config.mjs");
        expect(normalized.basePath).toBe("packages/eslint-legacy");
    });
});
