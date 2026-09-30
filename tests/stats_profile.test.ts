import type { Plugin, Transformer } from "unified";
import type { StatsFileResult } from "../shared/stats";
import type { ProcessorMeasurement } from "../src/stats/instrument";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { remark } from "remark";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { VFile } from "vfile";
import { afterEach, describe, expect, it } from "vitest";
import { createProfiledProcessor, emptyPhases } from "../src/stats/instrument";
import { aggregateReport, profileWorkspace } from "../src/stats/profile";

const directories: string[] = [];

async function workspace(files: Record<string, string>): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "remark-stats-"));
    directories.push(directory);
    await Promise.all(
        Object.entries(files).map(async ([path, content]) => {
            const target = join(directory, path);
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, content);
        })
    );
    return directory;
}

afterEach(async () => {
    await Promise.all(
        directories
            .splice(0)
            .map((directory) => rm(directory, { recursive: true, force: true }))
    );
});

function instrument(now?: () => number) {
    const measurement: ProcessorMeasurement = {
        phases: emptyPhases(),
        plugins: [],
    };
    const processor = createProfiledProcessor(
        measurement,
        (plugin) => ({ id: plugin.name, name: plugin.name }),
        now
    );
    return { processor, measurement };
}

describe("public processor instrumentation", () => {
    it.each([
        ["parser", remarkParse],
        ["compiler", remarkStringify],
    ] as const)(
        "preserves disabling the built-in %s",
        async (_name, plugin) => {
            const regular = remark().use(plugin, false);
            const profiled = instrument().processor.use(plugin, false);
            let expected: unknown;
            try {
                await regular.process("text");
            } catch (error) {
                expected = error;
            }
            expect(expected).toBeInstanceOf(Error);
            if (!(expected instanceof Error))
                throw new Error(
                    "Expected ordinary remark to reject the disabled builtin"
                );
            expect(() => profiled.process("text")).toThrow(expected);
        }
    );

    it("preserves builtin registration order, duplicate options, and dynamic registration", async () => {
        const custom: Plugin = function () {
            this.parser = () => ({ type: "root", children: [] });
            this.compiler = () => "custom output";
        };
        const dynamic: Plugin = function () {
            this.use(remarkParse, false).use(remarkParse, { position: false });
            this.use(remarkStringify, false).use(remarkStringify, {
                bullet: "-",
            });
        };
        for (const registration of ["direct", "dynamic"] as const) {
            const regular = remark().use(custom);
            const profiled = instrument().processor.use(custom);
            for (const processor of [regular, profiled]) {
                if (registration === "direct") {
                    processor
                        .use(remarkParse)
                        .use(remarkStringify, { bullet: "-" });
                } else {
                    processor.use(dynamic);
                }
            }
            expect(String(await profiled.process("text"))).toBe(
                String(await regular.process("text"))
            );
            expect(profiled.parse("text")).toEqual(regular.parse("text"));
        }
    });

    it("counts recursive public freezing only once", () => {
        let clock = 0;
        const { processor, measurement } = instrument(() => clock);
        processor
            .use(function recurse() {
                clock = 2;
                this.freeze();
            })
            .use(() => {
                clock = 5;
            })
            .freeze();
        expect(measurement.phases.initialization).toBe(5);
    });

    it("preserves sync, promise, callback, replacement trees and files", async () => {
        const synchronous: Plugin = () => (_tree, file) => {
            file.message("synchronous");
            return {
                type: "root",
                children: [
                    {
                        type: "paragraph",
                        children: [{ type: "text", value: "replacement" }],
                    },
                ],
            };
        };
        const promised: Plugin = () => async (tree, file) => {
            await Promise.resolve();
            file.message("promised");
            return tree;
        };
        const callback: Plugin = () => (tree, file, next) => {
            const replacement = new VFile({ value: file.value });
            replacement.messages = [...file.messages];
            replacement.message("callback");
            next(undefined, tree, replacement);
        };
        const final: Plugin = () => (_tree, file) => {
            expect(file.messages.map((message) => message.reason)).toEqual([
                "synchronous",
                "promised",
                "callback",
            ]);
            file.message("final");
        };
        const plugins = [
            synchronous,
            promised,
            callback,
            final,
        ];
        const regular = await remark().use(plugins).process("original");
        const { processor, measurement } = instrument();
        const profiled = await processor.use(plugins).process("original");
        expect(String(profiled)).toBe(String(regular));
        expect(profiled.messages.map((message) => message.reason)).toEqual(
            regular.messages.map((message) => message.reason)
        );
        expect(measurement.plugins.map((plugin) => plugin.invocations)).toEqual(
            [
                1,
                1,
                1,
                1,
            ]
        );
    });

    it("preserves duplicate merging, disabled plugins, presets, dynamic registration and extra arguments", async () => {
        const received: unknown[][] = [];
        const extra = { marker: "fileset" };
        const configured: Plugin<unknown[]> = function (...options) {
            received.push(options);
            return () => undefined;
        };
        const disabled: Plugin = () => {
            throw new Error("disabled plugin attached");
        };
        const dynamic: Plugin = function () {
            this.use({
                plugins: [
                    [
                        configured,
                        { second: 2 },
                        extra,
                    ],
                ],
            });
        };
        const { processor, measurement } = instrument();
        await processor
            .use({
                plugins: [
                    [
                        configured,
                        { first: 1 },
                        extra,
                    ],
                    [disabled, false],
                    dynamic,
                ],
            })
            .process("text");
        expect(received).toEqual([[{ first: 1, second: 2 }, extra]]);
        // Registering an existing plugin during freeze updates its options but
        // does not run its already-executed attacher again, just like unified.
        expect(measurement.plugins).toHaveLength(1);
        const second = instrument();
        await second.processor
            .use(configured, { first: 1 }, extra)
            .use(configured, { second: 2 }, extra)
            .process("text");
        expect(received[1]).toEqual([{ first: 1, second: 2 }, extra]);
        const added: Plugin = () => (tree) => tree;
        const third = instrument();
        await third.processor
            .use(function register() {
                this.use(added);
            })
            .process("text");
        expect(third.measurement.plugins.map((plugin) => plugin.name)).toEqual([
            "added",
        ]);
    });

    it.each([
        "throw",
        "return",
        "reject",
        "callback",
    ] as const)("preserves %s errors and records completion", async (mode) => {
        const failure = new Error(`failure ${mode}`);
        const transformer: Transformer =
            mode === "callback"
                ? (_tree, _file, next) => next(failure)
                : () => {
                      if (mode === "throw") throw failure;
                      if (mode === "reject") return Promise.reject(failure);
                      return failure;
                  };
        const plugin: Plugin = () => transformer;
        const { processor, measurement } = instrument();
        await expect(processor.use(plugin).process("text")).rejects.toBe(
            failure
        );
        expect(measurement.processingFailed).toBe(true);
        expect(measurement.plugins[0]?.invocations).toBe(1);
    });

    it("measures deterministic transformer elapsed time and public run overloads", async () => {
        let clock = 0;
        const { processor, measurement } = instrument(() => clock++);
        processor.use(() => (tree) => tree);
        const tree = processor.parse("text");
        await processor.run(tree);
        await new Promise<void>((resolve, reject) =>
            processor.run(tree, (error) => (error ? reject(error) : resolve()))
        );
        processor.stringify(tree);
        expect(measurement.plugins[0]?.durationMs).toBe(2);
        expect(measurement.plugins[0]?.invocations).toBe(2);
        expect(measurement.phases.initialization).toBe(1);
        expect(measurement.phases.parse).toBe(1);
        expect(measurement.phases.stringify).toBe(1);
        expect(measurement.phases.transform).toBe(6);
    });
});

describe("workspace profiling", () => {
    it("loads per-file configs, respects ignores, preserves sources and passes real FileSet", async () => {
        const cwd = await workspace({
            ".remarkrc.mjs": `function root(options, fileSet) { if (!fileSet || typeof fileSet.valueOf !== 'function') throw new Error('missing FileSet'); return (tree, file) => { file.message('root rule'); }; } root.pluginId = 'remark-lint:fixture'; export default { plugins: [root] };`,
            "a.md": "#   Root\n",
            "nested/.remarkrc.mjs": `export default { plugins: [function nested() { return (tree, file) => { file.message('nested rule'); }; }] };`,
            "nested/b.mdx": "Nested\n",
            "ignored.md": "ignored\n",
            ".remarkignore": "ignored.md\n",
            "node_modules/hidden.md": "hidden\n",
        });
        const progress: number[] = [];
        const report = await profileWorkspace({ cwd }, (state) =>
            progress.push(state.completedFiles)
        );
        expect(report.files.map((file) => file.filePath)).toEqual([
            "a.md",
            "nested/b.mdx",
        ]);
        expect(report.files[0]?.plugins[0]?.ruleId).toBe("remark-lint-fixture");
        expect(report.files[0]?.messages[0]?.reason).toBe("root rule");
        expect(report.files[1]?.messages[0]?.reason).toBe("nested rule");
        expect(report.warningCount).toBe(2);
        expect(report.partial).toBe(false);
        expect(progress.at(-1)).toBe(2);
        expect(await readFile(join(cwd, "a.md"), "utf8")).toBe("#   Root\n");
        expect(report.files.every((file) => file.phases.stringify > 0)).toBe(
            true
        );
    });

    it("honors an explicit config across nested directories", async () => {
        const cwd = await workspace({
            ".remarkrc.mjs": `export default { plugins: [function root() { return (tree,file) => file.message('root'); }] };`,
            "nested/.remarkrc.mjs": `throw new Error('nested should not load');`,
            "nested/a.md": "text",
        });
        const report = await profileWorkspace({
            cwd,
            userConfigPath: ".remarkrc.mjs",
        });
        expect(report.files[0]?.messages[0]?.reason).toBe("root");
    });

    it("keeps separate closure instances distinct while identifying shared references consistently", async () => {
        const cwd = await workspace({
            ".remarkrc.mjs": `function factory(label) { return function sameSource() { return (tree,file) => {file.message(label);}; }; } const one=factory('one'); const two=factory('two'); export default {plugins:[one,two,one]};`,
            "a.md": "text",
            "b.md": "text",
        });
        const report = await profileWorkspace({ cwd });
        const first = report.files[0]?.plugins.map((plugin) => plugin.id);
        const second = report.files[1]?.plugins.map((plugin) => plugin.id);
        expect(first).toHaveLength(2);
        expect(new Set(first).size).toBe(2);
        expect(first).toEqual(second);
        expect(
            report.files.every(
                (file) =>
                    file.durationMs >=
                    Object.values(file.phases).reduce(
                        (sum, duration) => sum + duration,
                        0
                    )
            )
        ).toBe(true);
    });

    it("preserves completed files when a transformer fails", async () => {
        const cwd = await workspace({
            ".remarkrc.mjs": `export default {plugins:[function conditional(){ return (tree,file) => { if(file.basename === 'bad.md') throw new Error('broken transform'); file.message('ok'); }; }]};`,
            "good.md": "good",
            "bad.md": "bad",
        });
        const report = await profileWorkspace({ cwd });
        expect(report.partial).toBe(true);
        expect(
            report.files.find((file) => file.filePath === "good.md")?.failed
        ).toBe(false);
        expect(
            report.files.find((file) => file.filePath === "bad.md")?.messages[0]
                ?.reason
        ).toContain("broken transform");
    });

    it.each([
        ["{}", "Expected node"],
        ["null", "`tree` is defined at this point"],
    ])(
        "reports parser output %s as a partial execution failure",
        async (output, reason) => {
            const cwd = await workspace({
                ".remarkrc.mjs": `export default { plugins: [function invalidParser() { this.parser = () => (${output}); }] };`,
                "a.md": "text",
            });
            const report = await profileWorkspace({ cwd });
            expect(report.partial).toBe(true);
            expect(report.errorCount).toBe(1);
            expect(report.files[0]?.failed).toBe(true);
            expect(report.files[0]?.messages[0]?.reason).toContain(reason);
        }
    );

    it("keeps reported lint errors as data instead of failing the analysis", async () => {
        const cwd = await workspace({
            ".remarkrc.mjs": `export default {plugins:[function lint(){ return (tree,file) => { file.message('lint error').fatal = true; }; }]};`,
            "a.md": "text",
        });
        const report = await profileWorkspace({ cwd });
        expect(report.partial).toBe(false);
        expect(report.errorCount).toBe(1);
    });

    it("attributes a real remark-lint rule and preserves its error severity", async () => {
        const ruleUrl = import.meta.resolve("remark-lint-heading-style");
        const cwd = await workspace({
            ".remarkrc.mjs": `import headingStyle from ${JSON.stringify(ruleUrl)}; export default { plugins: [[headingStyle, [2, 'atx']]] };`,
            "a.md": "Heading\n=======\n",
        });
        const report = await profileWorkspace({ cwd });
        expect(report.partial).toBe(false);
        expect(report.errorCount).toBe(1);
        expect(report.files[0]?.plugins[0]).toMatchObject({
            id: "remark-lint-heading-style",
            ruleId: "remark-lint-heading-style",
            packageName: "remark-lint-heading-style",
            invocations: 1,
        });
    });

    it("loads explicitly selected TypeScript config without changing its relative plugin resolution", async () => {
        const cwd = await workspace({
            "configuration/custom.mts": `const label: string = 'typescript'; export default { plugins: [['./plugin.mjs', {label}]] };`,
            "configuration/plugin.mjs": `export default function custom(options) { return (tree, file) => { file.message(options.label); }; }`,
            "a.md": "text",
        });
        const report = await profileWorkspace({
            cwd,
            userBasePath: cwd,
            userConfigPath: "configuration/custom.mts",
        });
        expect(report.files[0]?.messages[0]?.reason).toBe("typescript");
        expect(report.partial).toBe(false);
    });

    it.each([
        ["malformed config", "export default { plugins: 42 };"],
        [
            "initialization",
            "export default { plugins: [function broken(){ throw new Error('initialization failed'); }] };",
        ],
        [
            "missing plugin module",
            "export default { plugins: ['./does-not-exist.mjs'] };",
        ],
        [
            "missing configuration import",
            "import plugin from './does-not-exist.mjs'; export default { plugins: [plugin] };",
        ],
    ])("rejects %s errors", async (_name, config) => {
        const cwd = await workspace({
            ".remarkrc.mjs": config,
            "a.md": "text",
        });
        await expect(profileWorkspace({ cwd })).rejects.toThrow(
            /Cannot (?:configure|initialize) remark/u
        );
    });

    it("returns an empty report when no Markdown files are present", async () => {
        const cwd = await workspace({ ".remarkrc.json": "{}" });
        const report = await profileWorkspace({ cwd });
        expect(report.files).toEqual([]);
        expect(report.durationMs).toBe(0);
    });

    it("aggregates accumulated elapsed time independently of wall time", () => {
        const file: StatsFileResult = {
            filePath: "a.md",
            durationMs: 10,
            phases: { initialization: 1, parse: 2, transform: 3, stringify: 4 },
            plugins: [],
            messages: [],
            errors: 2,
            warnings: 1,
            failed: false,
        };
        const report = aggregateReport(
            [file, { ...file, filePath: "b.md", failed: true }],
            12,
            1234
        );
        expect(report).toMatchObject({
            wallTimeMs: 12,
            durationMs: 20,
            createdAt: 1234,
            partial: true,
            errorCount: 4,
            warningCount: 2,
            phases: { initialization: 2, parse: 4, transform: 6, stringify: 8 },
        });
    });
});
