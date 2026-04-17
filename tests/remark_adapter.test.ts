import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "pathe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TARGET_FILE } from "../src/constants";
import { ConfigPathError } from "../src/errors";
import { createRemarkInspectorAdapter } from "../src/inspectors/remark";

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "remark-config-inspector-"));
    tempDirs.push(dir);
    return dir;
}

async function writeFiles(
    root: string,
    files: Record<string, string>
): Promise<void> {
    await Promise.all(
        Object.entries(files).map(async ([path, content]) => {
            const fullPath = join(root, path);
            await mkdir(dirname(fullPath), { recursive: true });
            await writeFile(fullPath, content, { encoding: "utf8" });
        })
    );
}

afterEach(async () => {
    await Promise.all(
        tempDirs.map(async (dir) => {
            await rm(dir, { recursive: true, force: true });
        })
    );
});

describe("remark adapter", () => {
    it("resolves nearest remark config with correct precedence", async () => {
        const cwd = await createTempDir();
        await writeFiles(cwd, {
            ".remarkrc": "{}",
            "package.json": JSON.stringify(
                {
                    name: "fixture",
                    private: true,
                    remarkConfig: {
                        plugins: [],
                    },
                },
                null,
                2
            ),
        });

        const adapter = createRemarkInspectorAdapter();
        const resolved = await adapter.resolveConfigPath({ cwd });

        expect(resolved.basePath).toBe(cwd);
        expect(resolved.configPath).toBe(".remarkrc");
    });

    it("resolves package.json remarkConfig when no .remarkrc files are present", async () => {
        const cwd = await createTempDir();
        const nested = join(cwd, "packages/docs");

        await writeFiles(cwd, {
            "package.json": JSON.stringify(
                {
                    name: "fixture",
                    private: true,
                    remarkConfig: {
                        plugins: [],
                    },
                },
                null,
                2
            ),
        });
        await mkdir(nested, { recursive: true });

        const adapter = createRemarkInspectorAdapter();
        const resolved = await adapter.resolveConfigPath({ cwd: nested });

        expect(resolved.basePath).toBe(cwd);
        expect(resolved.configPath).toBe("../../package.json");
    });

    it("throws ConfigPathError when no remark config can be discovered", async () => {
        const cwd = await createTempDir();
        const adapter = createRemarkInspectorAdapter();

        await expect(adapter.resolveConfigPath({ cwd })).rejects.toBeInstanceOf(
            ConfigPathError
        );
    });

    it("reads remark config and exposes configured rule/preset metadata", async () => {
        const cwd = await createTempDir();
        await writeFiles(cwd, {
            ".remarkrc.mjs": `
import finalNewline from './plugins/remark-lint-final-newline.mjs'
import presetRecommended from './plugins/remark-preset-lint-recommended.mjs'

export default {
  settings: {
    bullet: '*'
  },
  plugins: [
    presetRecommended,
    [finalNewline, [1]]
  ]
}
`,
            "plugins/remark-lint-final-newline.mjs": `
function plugin() {
  return () => {}
}
plugin.pluginId = 'remark-lint-final-newline'
export default plugin
`,
            "plugins/remark-preset-lint-recommended.mjs": `
function plugin() {
  return () => {}
}
plugin.pluginId = 'remark-preset-lint-recommended'
export default plugin
`,
            ".remarkignore": "# comments are ignored\ncoverage/\n*.tmp\n",
            "docs/readme.md": "# Hello\n",
            "src/example.css": "a { color: red; }\n",
        });

        const adapter = createRemarkInspectorAdapter();
        const result = await adapter.readConfig({
            cwd,
            userConfigPath: ".remarkrc.mjs",
            globMatchedFiles: true,
            chdir: false,
        });

        expect(result.payload.meta.engine).toBe("remark");
        expect(result.payload.meta.configPath).toBe(".remarkrc.mjs");
        expect(result.payload.meta.ignoreFile).toEqual({
            path: ".remarkignore",
            patterns: ["coverage/", "*.tmp"],
        });

        expect(result.payload.configs).toHaveLength(1);
        expect(result.payload.configs[0]?.name).toBe("remark/root");
        expect(result.payload.configs[0]?.extends).toContain(
            "remark-preset-lint-recommended"
        );
        expect(result.payload.configs[0]?.rules).toMatchObject({
            "remark-lint-final-newline": [1],
        });
        expect(result.payload.rules["remark-lint-final-newline"]).toMatchObject(
            {
                name: "remark-lint-final-newline",
                plugin: "remark-lint",
                pluginPackageName: "remark-lint-final-newline",
            }
        );

        const files = result.payload.files ?? [];
        expect(
            files.some((entry) => entry.filepath.endsWith("docs/readme.md"))
        ).toBe(true);
        expect(
            files.some((entry) => entry.filepath.endsWith("src/example.css"))
        ).toBe(false);
    });

    it("loads discovered .remarkrc.mjs configs without explicit userConfigPath", async () => {
        const cwd = await createTempDir();
        await writeFiles(cwd, {
            ".remarkrc.mjs": `
export default {
  plugins: ['remark-lint-final-newline']
}
`,
        });

        const adapter = createRemarkInspectorAdapter();
        const result = await adapter.readConfig({
            cwd,
            chdir: false,
            globMatchedFiles: false,
        });

        expect(result.payload.meta.configPath).toBe(".remarkrc.mjs");
        expect(result.payload.configs[0]?.rules).toMatchObject({
            "remark-lint-final-newline": true,
        });
    });

    it("prefers package metadata URLs for external remark-lint rule docs", async () => {
        const cwd = await createTempDir();
        await writeFiles(cwd, {
            ".remarkrc.mjs": `
export default {
  plugins: ['remark-lint-write-good']
}
`,
            "node_modules/remark-lint-write-good/package.json": JSON.stringify(
                {
                    name: "remark-lint-write-good",
                    version: "1.0.0",
                    main: "index.js",
                    repository:
                        "git+https://github.com/zerok/remark-lint-write-good.git",
                },
                null,
                2
            ),
            "node_modules/remark-lint-write-good/index.js": `
module.exports = function remarkLintWriteGood() {
  return function () {};
};
`,
        });

        const adapter = createRemarkInspectorAdapter();
        const result = await adapter.readConfig({
            cwd,
            userConfigPath: ".remarkrc.mjs",
            globMatchedFiles: false,
            chdir: false,
        });

        expect(result.payload.rules["remark-lint-write-good"]?.docs?.url).toBe(
            "https://github.com/zerok/remark-lint-write-good"
        );
        expect(
            result.payload.rules["remark-lint-write-good"]?.docs?.urlSource
        ).toBe("meta");
    });

    it("continues loading when process.chdir is unavailable in workers", async () => {
        const cwd = await createTempDir();
        await writeFiles(cwd, {
            ".remarkrc.mjs": `
export default {
  plugins: ['remark-lint-final-newline']
}
`,
        });

        const chdirSpy = vi
            .spyOn(process, "chdir")
            .mockImplementation((() => {
                throw Object.assign(
                    new Error("process.chdir() is not supported in workers"),
                    {
                        code: "ERR_WORKER_UNSUPPORTED_OPERATION",
                    }
                );
            }) as typeof process.chdir);

        try {
            const adapter = createRemarkInspectorAdapter();
            const result = await adapter.readConfig({
                cwd,
                globMatchedFiles: false,
            });

            expect(chdirSpy).toHaveBeenCalled();
            expect(result.payload.configs[0]?.rules).toMatchObject({
                "remark-lint-final-newline": true,
            });
        } finally {
            chdirSpy.mockRestore();
        }
    });

        it("handles symbol plugin ids, multi-argument rule values, and sorted presets", async () => {
                const cwd = await createTempDir();
                const absoluteTarget = join(cwd, "docs/z.md");

                await writeFiles(cwd, {
                        ".remarkrc.mjs": `
import symbolRule from './plugins/symbol-rule.mjs'
import emptyRule from './plugins/empty-rule.mjs'
import presetZeta from './plugins/remark-preset-lint-zeta.mjs'
import presetAlpha from './plugins/remark-preset-lint-alpha.mjs'

export default {
    settings: 'invalid-settings-shape',
    plugins: [
        [symbolRule, 2, { allow: true }],
        [emptyRule, false],
        presetZeta,
        presetAlpha
    ]
}
`,
                        "plugins/symbol-rule.mjs": `
function plugin() {
    return () => {}
}
plugin.pluginId = Symbol('remark-lint-symbol-rule')
export default plugin
`,
                        "plugins/empty-rule.mjs": `
function plugin() {
    return () => {}
}
plugin.pluginId = ''
export default plugin
`,
                        "plugins/remark-preset-lint-zeta.mjs": `
function plugin() {
    return () => {}
}
plugin.pluginId = 'remark-preset-lint-zeta'
export default plugin
`,
                        "plugins/remark-preset-lint-alpha.mjs": `
function plugin() {
    return () => {}
}
plugin.pluginId = 'remark-preset-lint-alpha'
export default plugin
`,
                        "docs/a.md": "# A\n",
                        "docs/z.md": "# Z\n",
                });

                const adapter = createRemarkInspectorAdapter();
                const result = await adapter.readConfig({
                        cwd,
                        userConfigPath: ".remarkrc.mjs",
                        targetFilePath: absoluteTarget,
                        globMatchedFiles: true,
                        chdir: false,
                });

                expect(result.payload.meta.targetFilePath).toBe(absoluteTarget);
                expect(result.payload.meta.ignoreFile).toBeUndefined();
                expect(result.payload.configs[0]?.rules).toMatchObject({
                    "remark-lint-symbol-rule": [2, { allow: true }],
                });
                expect(result.payload.configs[0]?.extends).toEqual([
                        "remark-preset-lint-alpha",
                        "remark-preset-lint-zeta",
                ]);
                expect(result.payload.rules["remark-lint-symbol-rule"]?.docs?.url).toBe(
                    "https://www.npmjs.com/package/remark-lint-symbol-rule"
                );

                const files = result.payload.files?.map((entry) => entry.filepath) ?? [];
                expect(files).toEqual(["docs/a.md", "docs/z.md"]);
        });

        it("can skip file matching when globMatchedFiles is disabled", async () => {
                const cwd = await createTempDir();

                await writeFiles(cwd, {
                        ".remarkrc.mjs": `
export default {
    plugins: []
}
`,
                });

                const adapter = createRemarkInspectorAdapter();
                const result = await adapter.readConfig({
                        cwd,
                        userConfigPath: ".remarkrc.mjs",
                        globMatchedFiles: false,
                        chdir: false,
                });

                expect(result.payload.files).toBeUndefined();
                expect(result.payload.meta.targetFilePath).toBe(DEFAULT_TARGET_FILE);
        });
});
