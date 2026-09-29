import type { Plugin } from "unified";
import type {
    ConfigResult,
    Context,
    FileSet,
    Options,
    Preset,
} from "unified-engine";
import type { VFile } from "vfile";
import type {
    StatsFileResult,
    StatsMessage,
    StatsPluginTiming,
    StatsProgress,
    StatsReport,
} from "../../shared/stats";
import type { ReadConfigOptions } from "../inspectors/contracts";
import type { ProcessorMeasurement } from "./instrument";
import { createHash } from "node:crypto";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Configuration, engine } from "unified-engine";
import { ConfigPathError } from "../errors";
import { createRemarkInspectorAdapter } from "../inspectors/remark";
import { createProfiledProcessor, emptyPhases } from "./instrument";

function portablePath(base: string, file: string): string {
    return relative(base, resolve(base, file)).replaceAll("\\", "/");
}

function errorMessage(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    return error.cause
        ? `${error.message}: ${errorMessage(error.cause)}`
        : error.message;
}

function pluginIdentifier(): (
    plugin: Plugin<unknown[]>
) => Omit<StatsPluginTiming, "durationMs" | "invocations"> {
    const identities = new WeakMap<
        Plugin<unknown[]>,
        Omit<StatsPluginTiming, "durationMs" | "invocations">
    >();
    const identityCounts = new Map<string, number>();
    return (plugin) => {
        const existing = identities.get(plugin);
        if (existing) return existing;
        const explicit = "pluginId" in plugin ? plugin.pluginId : undefined;
        const declared =
            typeof explicit === "symbol"
                ? explicit.description
                : typeof explicit === "string"
                  ? explicit
                  : undefined;
        const ruleName = declared ?? plugin.name;
        const ruleId = ruleName.startsWith("remark-lint:")
            ? ruleName.replace("remark-lint:", "remark-lint-")
            : undefined;
        const name = ruleId ?? declared ?? plugin.name ?? "anonymous";
        const sourceId = createHash("sha256")
            .update(Function.prototype.toString.call(plugin))
            .digest("hex")
            .slice(0, 12);
        const baseId =
            ruleId ?? declared ?? `${name || "anonymous"}#${sourceId}`;
        const count = (identityCounts.get(baseId) ?? 0) + 1;
        identityCounts.set(baseId, count);
        const result = {
            id: count === 1 ? baseId : `${baseId}:${count}`,
            name: name || "Anonymous plugin",
            ...(ruleId ? { ruleId, packageName: ruleId } : {}),
        };
        identities.set(plugin, result);
        return result;
    };
}

function messageResult(message: VFile["messages"][number]): StatsMessage {
    return {
        reason: message.cause
            ? `${message.reason}: ${errorMessage(message.cause)}`
            : message.reason,
        fatal: message.fatal ?? null,
        ...(message.ruleId ? { ruleId: message.ruleId } : {}),
        ...(message.source ? { source: message.source } : {}),
        ...(message.line !== undefined ? { line: message.line } : {}),
        ...(message.column !== undefined ? { column: message.column } : {}),
    };
}

/** Summed elapsed processing time is intentionally separate from wall time. */
export function aggregateReport(
    files: StatsFileResult[],
    wallTimeMs: number,
    createdAt: number
): StatsReport {
    const phases = emptyPhases();
    for (const file of files) {
        phases.initialization += file.phases.initialization;
        phases.parse += file.phases.parse;
        phases.transform += file.phases.transform;
        phases.stringify += file.phases.stringify;
    }
    return {
        version: 1,
        createdAt,
        wallTimeMs,
        phases,
        files,
        durationMs: files.reduce((total, file) => total + file.durationMs, 0),
        errorCount: files.reduce((total, file) => total + file.errors, 0),
        warningCount: files.reduce((total, file) => total + file.warnings, 0),
        partial: files.some((file) => file.failed),
        diagnostics: [],
    };
}

async function typescriptConfig(configPath: string): Promise<ConfigResult> {
    const loaded = (await import(pathToFileURL(configPath).href)) as {
        default?: unknown;
    };
    if (!loaded.default || typeof loaded.default !== "object")
        throw new Error(`Expected a preset exported from ${configPath}`);
    const configuration = new Configuration({
        cwd: dirname(configPath),
        defaultConfig: loaded.default as Preset,
        pluginPrefix: "remark",
        detectConfig: false,
    });
    return await new Promise((accept, reject) =>
        configuration.load(configPath, (error, result) => {
            if (error) reject(error);
            else if (result) accept(result);
            else reject(new Error(`Cannot load configuration ${configPath}`));
        })
    );
}

export async function profileWorkspace(
    options: ReadConfigOptions,
    onProgress?: (progress: StatsProgress) => void
): Promise<StatsReport> {
    const started = performance.now();
    let basePath: string;
    try {
        basePath = (
            await createRemarkInspectorAdapter().resolveConfigPath(options)
        ).basePath;
    } catch (error) {
        if (!(error instanceof ConfigPathError)) throw error;
        basePath = resolve(options.cwd, options.userBasePath ?? ".");
    }
    const measurements: ProcessorMeasurement[] = [];
    const completedAt = new Map<string, number>();
    const identify = pluginIdentifier();
    let completedFiles = 0;
    const observedSets = new WeakSet<FileSet>();
    const observe: Plugin<unknown[]> = function (_options, set) {
        const fileSet = set as FileSet;
        if (observedSets.has(fileSet)) return;
        observedSets.add(fileSet);
        onProgress?.({
            completedFiles,
            discoveredFiles: fileSet.valueOf().length,
        });
        fileSet.on("one", (file: VFile) => {
            completedAt.set(file.history[0] ?? file.path, performance.now());
            completedFiles += 1;
            onProgress?.({
                completedFiles,
                discoveredFiles: fileSet.valueOf().length,
                currentFile: portablePath(basePath, file.path),
            });
        });
    };
    const settings: Options = {
        cwd: basePath,
        files: ["."],
        extensions: [
            "md",
            "markdown",
            "mdown",
            "mkdn",
            "mkd",
            "mkdown",
            "mdx",
        ],
        processor: () => {
            const measurement: ProcessorMeasurement = {
                phases: emptyPhases(),
                plugins: [],
                startedAt: performance.now(),
            };
            measurements.push(measurement);
            return createProfiledProcessor(measurement, identify);
        },
        rcName: ".remarkrc",
        packageField: "remarkConfig",
        pluginPrefix: "remark",
        ignoreName: ".remarkignore",
        silentlyIgnore: true,
        alwaysStringify: true,
        output: false,
        out: false,
        reporter: () => "",
        plugins: [observe],
    };
    if (options.userConfigPath) {
        const configPath = resolve(options.cwd, options.userConfigPath);
        settings.detectConfig = false;
        if (/\.(?:ts|mts|cts)$/u.test(configPath)) {
            const configuration = await typescriptConfig(configPath);
            settings.plugins = [...configuration.plugins, observe];
            settings.settings = configuration.settings;
        } else {
            settings.rcPath = configPath;
        }
    }
    const context = await new Promise<Context>((accept, reject) =>
        engine(settings, (error, _code, result) => {
            if (error) reject(error);
            else if (result) accept(result);
            else reject(new Error("Remark profiling did not return a result"));
        })
    );
    const byPath = new Map(
        measurements
            .filter((item) => item.filePath)
            .map((item) => [item.filePath, item])
    );
    const files = context.files
        .filter((file) => !file.data["unifiedEngineIgnored"])
        .map((file): StatsFileResult => {
            const measurement = byPath.get(file.history[0] ?? file.path);
            const fatalMessages = file.messages.filter(
                (message) => message.fatal === true
            );
            if (measurement?.initializationError)
                throw new Error(
                    `Cannot initialize remark for ${portablePath(basePath, file.path)}: ${errorMessage(measurement.initializationError)}`
                );
            if (
                !measurement &&
                fatalMessages.some(
                    (message) =>
                        message.cause &&
                        !(
                            typeof message.cause === "object" &&
                            "code" in message.cause
                        )
                )
            ) {
                throw new Error(
                    `Cannot configure remark for ${portablePath(basePath, file.path)}: ${fatalMessages.map((message) => errorMessage(message.cause)).join("; ")}`
                );
            }
            const phases = measurement?.phases ?? emptyPhases();
            return {
                filePath: portablePath(basePath, file.history[0] ?? file.path),
                phases,
                durationMs:
                    measurement?.startedAt === undefined
                        ? 0
                        : Math.max(
                              0,
                              (completedAt.get(file.history[0] ?? file.path) ??
                                  performance.now()) - measurement.startedAt
                          ),
                plugins:
                    measurement?.plugins.filter(
                        (plugin) => plugin.invocations > 0
                    ) ?? [],
                errors: fatalMessages.length,
                warnings: file.messages.filter(
                    (message) => message.fatal === false
                ).length,
                messages: file.messages.map(messageResult),
                failed: measurement
                    ? Boolean(measurement.processingFailed)
                    : fatalMessages.length > 0,
            };
        })
        .sort((left, right) => left.filePath.localeCompare(right.filePath));
    onProgress?.({
        completedFiles: files.length,
        discoveredFiles: files.length,
    });
    return aggregateReport(files, performance.now() - started, Date.now());
}
