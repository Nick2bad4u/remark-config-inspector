import type { remark } from "remark";
import type {
    Pluggable,
    PluggableList,
    Plugin,
    Preset,
    Processor,
} from "unified";
import type { StatsPhases, StatsPluginTiming } from "../../shared/stats";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { wrap } from "trough";
import { unified } from "unified";

type Attacher = Plugin<unknown[]>;
type Callable = (this: unknown, ...args: unknown[]) => unknown;

export interface ProcessorMeasurement {
    phases: StatsPhases;
    plugins: StatsPluginTiming[];
    filePath?: string;
    initializationError?: unknown;
    processingFailed?: boolean;
    startedAt?: number;
}

export function emptyPhases(): StatsPhases {
    return { initialization: 0, parse: 0, transform: 0, stringify: 0 };
}

/** Instruments public processor methods without accessing unified's internals. */
export function createProfiledProcessor(
    measurement: ProcessorMeasurement,
    identify: (
        plugin: Attacher
    ) => Omit<StatsPluginTiming, "durationMs" | "invocations">,
    now: () => number = () => performance.now()
): ReturnType<typeof remark> {
    // Install instrumentation before adding remark's builtins. Starting from
    // remark() would leave their original identities registered alongside the
    // wrappers, breaking later deduplication, configuration, and disabling.
    const processor = unified();
    const originalUse = processor.use;
    const wrappers = new WeakMap<Attacher, Attacher>();

    function instrumentPlugin(plugin: Attacher): Attacher {
        const existing = wrappers.get(plugin);
        if (existing) return existing;
        const identity = identify(plugin);
        const instrumented: Attacher = function (this: Processor, ...args) {
            const transformer = Reflect.apply(plugin, this, args) as unknown;
            if (typeof transformer !== "function") return undefined;
            const timing: StatsPluginTiming = {
                ...identity,
                durationMs: 0,
                invocations: 0,
            };
            measurement.plugins.push(timing);
            // Preserve trough's sync, promise, callback, returned Error, and
            // replacement tree/file semantics, including once-only completion.
            return function (tree, file, next) {
                const start = now();
                wrap(transformer as Callable, (error, ...output: unknown[]) => {
                    timing.durationMs += now() - start;
                    timing.invocations += 1;
                    Reflect.apply(next, undefined, [error, ...output]);
                })(tree, file);
            };
        };
        wrappers.set(plugin, instrumented);
        return instrumented;
    }

    function instrumentList(list: PluggableList): PluggableList {
        return list.map((entry): Pluggable => {
            if (typeof entry === "function") return instrumentPlugin(entry);
            if (Array.isArray(entry)) {
                const [plugin, ...parameters] = entry;
                return [instrumentPlugin(plugin), ...parameters];
            }
            return instrumentPreset(entry);
        });
    }

    function instrumentPreset(preset: Preset): Preset {
        return {
            ...preset,
            ...(preset.plugins
                ? { plugins: instrumentList(preset.plugins) }
                : {}),
        };
    }

    // The cast retains unified's overload surface; only the first argument is
    // transformed, while every attacher parameter (including FileSet) survives.
    processor.use = function (
        this: typeof processor,
        value: unknown,
        ...parameters: unknown[]
    ) {
        const wrapped =
            typeof value === "function"
                ? instrumentPlugin(value as Attacher)
                : Array.isArray(value)
                  ? instrumentList(value as PluggableList)
                  : value && typeof value === "object"
                    ? instrumentPreset(value as Preset)
                    : value;
        return Reflect.apply(originalUse, this, [wrapped, ...parameters]);
    } as typeof processor.use;

    const originalFreeze = processor.freeze;
    let frozen = false;
    let freezing = false;
    processor.freeze = function () {
        if (frozen || freezing) return originalFreeze.call(this);
        const start = now();
        freezing = true;
        try {
            const result = originalFreeze.call(this);
            frozen = true;
            return result;
        } catch (error) {
            measurement.initializationError = error;
            throw error;
        } finally {
            freezing = false;
            measurement.phases.initialization += now() - start;
        }
    };

    const originalParse = processor.parse;
    processor.parse = function (file) {
        if (
            file &&
            typeof file === "object" &&
            "path" in file &&
            typeof file.path === "string"
        ) {
            measurement.filePath = file.path;
        }
        this.freeze();
        const start = now();
        try {
            // A configured parser is an untrusted runtime boundary. The engine
            // rejects falsy trees before calling run(), so record that failure
            // here while leaving its original return/error behavior intact.
            const tree: unknown = originalParse.call(this, file);
            if (
                !tree ||
                typeof tree !== "object" ||
                !("type" in tree) ||
                typeof tree.type !== "string"
            ) {
                measurement.processingFailed = true;
            }
            return tree as ReturnType<typeof originalParse>;
        } catch (error) {
            measurement.processingFailed = true;
            throw error;
        } finally {
            measurement.phases.parse += now() - start;
        }
    };

    const originalStringify = processor.stringify;
    processor.stringify = function (tree, file) {
        this.freeze();
        const start = now();
        try {
            return originalStringify.call(this, tree, file);
        } catch (error) {
            measurement.processingFailed = true;
            throw error;
        } finally {
            measurement.phases.stringify += now() - start;
        }
    };

    const originalRun = processor.run;
    processor.run = function (
        this: typeof processor,
        tree: unknown,
        file?: unknown,
        callback?: unknown
    ) {
        this.freeze();
        const start = now();
        const done = typeof file === "function" ? file : callback;
        const value = typeof file === "function" ? undefined : file;
        let completed = false;
        const recordCompletion = (error: unknown) => {
            if (completed) return;
            completed = true;
            measurement.phases.transform += now() - start;
            if (error) measurement.processingFailed = true;
        };
        const run = (complete: Callable) => {
            try {
                return Reflect.apply(originalRun, this, [
                    tree,
                    value,
                    complete,
                ]);
            } catch (error) {
                recordCompletion(error);
                throw error;
            }
        };
        if (typeof done === "function") {
            run((...args) => {
                recordCompletion(args[0]);
                return Reflect.apply(done, undefined, args);
            });
            return undefined;
        }
        return new Promise((resolve, reject) => {
            run((error, result) => {
                recordCompletion(error);
                if (error) {
                    reject(error);
                } else resolve(result);
            });
        });
    } as typeof processor.run;
    return processor.use(remarkParse).use(remarkStringify);
}
