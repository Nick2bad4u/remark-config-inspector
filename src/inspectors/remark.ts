import type {
    ExtendsInfo,
    FlatConfigItem,
    IgnoreFileInfo,
    MatchedFile,
    Payload,
    RuleInfo,
    RulesRecord,
} from "../../shared/types";
import type {
    InspectorAdapter,
    InspectorReadResult,
    ReadConfigOptions,
    ResolveConfigPathOptions,
    ResolvedConfigPath,
} from "./contracts";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { findUp } from "find-up";
import { basename, dirname, join, normalize, relative, resolve } from "pathe";
import { glob } from "tinyglobby";
import { Configuration } from "unified-engine";
import {
    DEFAULT_WORKSPACE_SCAN_GLOBS,
    isGeneralConfig,
    matchFile,
} from "../../shared/configs";
import {
    configFilenames,
    DEFAULT_TARGET_FILE,
    MARK_CHECK,
    MARK_INFO,
} from "../constants";
import { ConfigPathError } from "../errors";

const REMARK_IGNORE_FILENAME = ".remarkignore";
const REMARK_PACKAGE_FIELD = "remarkConfig";
const REMARK_PLUGIN_PREFIX = "remark";
const REMARK_RC_NAME = ".remarkrc";

const DEFAULT_WORKSPACE_SCAN_IGNORES = [
    "**/node_modules/**",
    "**/.git/**",
    "**/.nuxt/**",
    "**/.output/**",
    "**/dist/**",
    "**/coverage/**",
];

const MAX_WORKSPACE_MATCHED_FILES = 5000;

interface InternalResolvedConfigPath extends ResolvedConfigPath {
    absoluteConfigPath?: string;
}

interface LoadedRemarkConfig {
    filePath: string;
    plugins: unknown[];
    settings: Record<string, unknown>;
}

interface RemarkModuleConfig {
    plugins?: unknown;
    settings?: unknown;
}

interface RemarkIgnoreResolution {
    info?: IgnoreFileInfo;
    absolutePath?: string;
}

interface PackageRepositoryField {
    url?: unknown;
    directory?: unknown;
}

interface PackageBugsField {
    url?: unknown;
}

interface PackageMetadata {
    name?: unknown;
    description?: unknown;
    homepage?: unknown;
    repository?: unknown;
    bugs?: unknown;
}

interface RuleDocsResolution {
    url: string;
    urlSource: "meta" | "inferred";
}

interface ExtendsInfoOptions {
    specifier: string;
    basePath: string;
    usedByConfigIndexes: number[];
}

const requireForResolution = createRequire(import.meta.url);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isWorkerUnsupportedChdirError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    if (error.message.includes("process.chdir() is not supported in workers"))
        return true;

    return (
        "code" in error &&
        (error as { code?: unknown }).code ===
            "ERR_WORKER_UNSUPPORTED_OPERATION"
    );
}

function isJavaScriptConfigPath(path: string): boolean {
    return /\.[cm]?js$/u.test(path);
}

function toLoadedRemarkConfig(
    filePath: string,
    config: RemarkModuleConfig
): LoadedRemarkConfig {
    return {
        filePath: normalize(filePath),
        plugins: Array.isArray(config.plugins) ? config.plugins : [],
        settings: isRecord(config.settings) ? config.settings : {},
    };
}

async function loadRemarkConfigFromModule(
    filePath: string
): Promise<LoadedRemarkConfig> {
    const module = await import(pathToFileURL(filePath).href);
    const config = isRecord(module.default)
        ? (module.default as RemarkModuleConfig)
        : isRecord(module)
          ? (module as unknown as RemarkModuleConfig)
          : undefined;

    if (!config)
        throw new Error(`Cannot parse given file \`${basename(filePath)}\``);

    return toLoadedRemarkConfig(filePath, config);
}

function toRelativePath(cwd: string, path: string): string {
    const rel = relative(cwd, path).replaceAll("\\", "/");
    return rel.length > 0 ? rel : normalize(path).replaceAll("\\", "/");
}

function resolveFromCwd(cwd: string, filepath: string): string {
    if (isAbsolute(filepath)) return normalize(filepath);
    return normalize(resolve(cwd, filepath));
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

async function hasRemarkConfigField(packageFilePath: string): Promise<boolean> {
    if (!(await pathExists(packageFilePath))) return false;

    try {
        const raw = await readFile(packageFilePath, "utf8");
        const parsed = JSON.parse(raw) as unknown;
        return isRecord(parsed) && REMARK_PACKAGE_FIELD in parsed;
    } catch {
        return false;
    }
}

async function findNearestConfigPath(
    startDir: string
): Promise<string | undefined> {
    let current = normalize(resolve(startDir));

    while (true) {
        for (const filename of configFilenames) {
            const candidate = normalize(join(current, filename));

            if (filename === "package.json") {
                if (await hasRemarkConfigField(candidate)) return candidate;
                continue;
            }

            if (await pathExists(candidate)) return candidate;
        }

        const parent = dirname(current);
        if (parent === current) return undefined;
        current = parent;
    }
}

async function resolveConfigPathInternal(
    options: ResolveConfigPathOptions
): Promise<InternalResolvedConfigPath> {
    const cwd = normalize(options.cwd);
    const userBasePath = options.userBasePath
        ? resolveFromCwd(cwd, options.userBasePath)
        : undefined;

    if (options.userConfigPath) {
        const absoluteConfigPath = resolveFromCwd(cwd, options.userConfigPath);
        return {
            basePath: userBasePath ?? normalize(dirname(absoluteConfigPath)),
            configPath: absoluteConfigPath,
            absoluteConfigPath,
        };
    }

    const searchStartPath = userBasePath ?? cwd;
    const discoveredConfigPath = await findNearestConfigPath(searchStartPath);
    if (!discoveredConfigPath)
        throw new ConfigPathError(searchStartPath, configFilenames);

    return {
        basePath: userBasePath ?? normalize(dirname(discoveredConfigPath)),
        configPath: discoveredConfigPath,
        absoluteConfigPath: discoveredConfigPath,
    };
}

function extractPluginId(plugin: unknown): string | undefined {
    if (typeof plugin === "string") {
        return plugin.length > 0 ? plugin : undefined;
    }

    if (typeof plugin === "function" || isRecord(plugin)) {
        const pluginId = (plugin as { pluginId?: unknown }).pluginId;

        if (typeof pluginId === "string") {
            return pluginId.length > 0 ? pluginId : undefined;
        }

        if (typeof pluginId === "symbol") {
            return pluginId.description;
        }
    }

    return undefined;
}

function normalizePluginEntry(entry: unknown): [unknown, ...unknown[]] {
    if (Array.isArray(entry) && entry.length > 0)
        return entry as [unknown, ...unknown[]];

    return [entry];
}

function isRemarkLintRule(pluginId: string): boolean {
    return pluginId.startsWith("remark-lint-") && pluginId !== "remark-lint";
}

function isRemarkPreset(pluginId: string): boolean {
    return pluginId.startsWith("remark-preset-");
}

function toRuleValue(parameters: unknown[]): unknown {
    if (parameters.length === 0) return true;
    if (parameters.length === 1) return parameters[0];
    return parameters;
}

function toRuleDescription(ruleName: string): string {
    const withoutPrefix = ruleName.replace(/^remark-lint-/u, "");
    const phrase = withoutPrefix.replaceAll("-", " ").trim();
    if (!phrase.length) return "No description available";
    return `${phrase[0]!.toUpperCase()}${phrase.slice(1)}`;
}

function inferRuleDocsUrl(ruleName: string): string {
    return `https://www.npmjs.com/package/${ruleName}`;
}

function normalizeRepositoryUrl(url: string): string {
    let normalized = url.trim();
    if (normalized.startsWith("github:")) {
        normalized = `https://github.com/${normalized.slice("github:".length)}`;
    }

    normalized = normalized.replace(/^git\+/u, "");

    if (normalized.startsWith("git://")) {
        normalized = `https://${normalized.slice("git://".length)}`;
    }

    if (normalized.endsWith(".git")) {
        normalized = normalized.slice(0, -".git".length);
    }

    return normalized;
}

function resolveRepositoryUrlFromMetadata(
    metadata: PackageMetadata
): string | undefined {
    const repository = metadata.repository;
    if (typeof repository === "string" && repository.length > 0) {
        return normalizeRepositoryUrl(repository);
    }

    if (isRecord(repository)) {
        const repositoryField = repository as PackageRepositoryField;

        if (
            typeof repositoryField.url === "string" &&
            repositoryField.url.length > 0
        ) {
            return normalizeRepositoryUrl(repositoryField.url);
        }
    }

    return undefined;
}

function resolveBugsUrlFromMetadata(
    metadata: PackageMetadata
): string | undefined {
    const bugs = metadata.bugs;

    if (typeof bugs === "string" && bugs.length > 0) return bugs;

    if (isRecord(bugs)) {
        const bugsField = bugs as PackageBugsField;
        if (typeof bugsField.url === "string" && bugsField.url.length > 0)
            return bugsField.url;
    }

    return undefined;
}

function resolvePackageJsonPath(
    packageName: string,
    basePath: string
): string | undefined {
    for (const rootPath of [basePath, process.cwd()]) {
        try {
            return requireForResolution.resolve(`${packageName}/package.json`, {
                paths: [rootPath],
            });
        } catch {
            continue;
        }
    }

    return undefined;
}

async function resolveRuleDocsFromPackageMetadata(
    packageName: string,
    basePath: string
): Promise<RuleDocsResolution | undefined> {
    const metadata = await readPackageMetadata(packageName, basePath);
    if (!metadata) return undefined;

    return resolveDocsFromPackageMetadata(metadata);
}

function resolveDocsFromPackageMetadata(
    metadata: PackageMetadata
): RuleDocsResolution | undefined {
    const homepage = metadata.homepage;

    if (typeof homepage === "string" && homepage.length > 0) {
        return {
            url: homepage,
            urlSource: "meta",
        };
    }

    const repositoryUrl = resolveRepositoryUrlFromMetadata(metadata);
    if (repositoryUrl) {
        return {
            url: repositoryUrl,
            urlSource: "meta",
        };
    }

    const bugsUrl = resolveBugsUrlFromMetadata(metadata);
    if (bugsUrl) {
        return {
            url: bugsUrl,
            urlSource: "meta",
        };
    }

    return undefined;
}

async function readPackageMetadata(
    packageName: string,
    basePath: string
): Promise<PackageMetadata | undefined> {
    const packageJsonPath = resolvePackageJsonPath(packageName, basePath);
    if (!packageJsonPath) return undefined;

    try {
        const rawMetadata = await readFile(packageJsonPath, "utf8");
        const parsedMetadata = JSON.parse(rawMetadata) as unknown;
        if (!isRecord(parsedMetadata)) return undefined;

        return parsedMetadata as PackageMetadata;
    } catch {
        return undefined;
    }
}

async function resolveRuleDocs(
    ruleName: string,
    basePath: string
): Promise<RuleDocsResolution> {
    const metadataDocs = await resolveRuleDocsFromPackageMetadata(
        ruleName,
        basePath
    );
    if (metadataDocs) return metadataDocs;

    return {
        url: inferRuleDocsUrl(ruleName),
        urlSource: "inferred",
    };
}

function createRuleInfo(ruleName: string, docs: RuleDocsResolution): RuleInfo {
    return {
        name: ruleName,
        plugin: "remark-lint",
        pluginPackageName: ruleName,
        docs: {
            description: toRuleDescription(ruleName),
            descriptionSource: "generated",
            url: docs.url,
            urlSource: docs.urlSource,
        },
    };
}

function inferPresetDocsUrl(specifier: string): string {
    return `https://www.npmjs.com/package/${specifier}`;
}

function extractCustomSyntax(settings: Record<string, unknown>):
    | string
    | undefined {
    const syntax = settings["syntax"];
    if (typeof syntax === "string" && syntax.length > 0) return syntax;

    const customSyntax = settings["customSyntax"];
    if (typeof customSyntax === "string" && customSyntax.length > 0)
        return customSyntax;

    return undefined;
}

async function loadPresetConfig(
    specifier: string,
    basePath: string
): Promise<LoadedRemarkConfig | undefined> {
    for (const rootPath of [basePath, process.cwd()]) {
        try {
            const resolvedModulePath = requireForResolution.resolve(specifier, {
                paths: [rootPath],
            });

            return await loadRemarkConfigFromModule(resolvedModulePath);
        } catch {
            continue;
        }
    }

    return undefined;
}

async function createPresetExtendsInfo(
    options: ExtendsInfoOptions
): Promise<ExtendsInfo> {
    const { specifier, basePath, usedByConfigIndexes } = options;
    const packageMetadata = await readPackageMetadata(specifier, basePath);
    const packageDocs = packageMetadata
        ? resolveDocsFromPackageMetadata(packageMetadata)
        : undefined;
    const loadedPreset = await loadPresetConfig(specifier, basePath);

    const pluginIds = new Set<string>();
    const ruleNames = new Set<string>();
    const directExtends = new Set<string>();

    for (const pluginEntry of loadedPreset?.plugins ?? []) {
        const [plugin] = normalizePluginEntry(pluginEntry);
        const pluginId = extractPluginId(plugin);
        if (!pluginId) continue;

        pluginIds.add(pluginId);

        if (isRemarkPreset(pluginId) && pluginId !== specifier)
            directExtends.add(pluginId);

        if (isRemarkLintRule(pluginId)) ruleNames.add(pluginId);
    }

    const rules = [...ruleNames].toSorted((left, right) =>
        left.localeCompare(right)
    );
    const plugins = [...pluginIds].toSorted((left, right) =>
        left.localeCompare(right)
    );

    return {
        specifier,
        packageName:
            typeof packageMetadata?.name === "string" &&
            packageMetadata.name.length > 0
                ? packageMetadata.name
                : specifier,
        source: "package",
        description:
            typeof packageMetadata?.description === "string" &&
            packageMetadata.description.length > 0
                ? packageMetadata.description
                : `Preset package ${specifier}`,
        docsUrl: packageDocs?.url ?? inferPresetDocsUrl(specifier),
        docsUrlSource: packageDocs?.urlSource ?? "inferred",
        ...(directExtends.size > 0
            ? {
                  directExtends: [...directExtends].toSorted((left, right) =>
                      left.localeCompare(right)
                  ),
              }
            : {}),
        ...(plugins.length > 0 ? { plugins } : {}),
        ...(loadedPreset
            ? { customSyntax: extractCustomSyntax(loadedPreset.settings) }
            : {}),
        ruleCount: rules.length,
        ...(rules.length > 0 ? { rules } : {}),
        usedByConfigIndexes,
    };
}

async function loadRemarkConfig(options: {
    cwd: string;
    targetFilePath: string;
    absoluteConfigPath?: string;
}): Promise<LoadedRemarkConfig | undefined> {
    if (
        options.absoluteConfigPath &&
        isJavaScriptConfigPath(options.absoluteConfigPath)
    ) {
        return await loadRemarkConfigFromModule(options.absoluteConfigPath);
    }

    const configurationOptions: ConstructorParameters<typeof Configuration>[0] =
        {
            cwd: options.cwd,
            packageField: REMARK_PACKAGE_FIELD,
            pluginPrefix: REMARK_PLUGIN_PREFIX,
            rcName: REMARK_RC_NAME,
        };

    if (options.absoluteConfigPath) {
        configurationOptions.detectConfig = false;
        configurationOptions.rcPath = options.absoluteConfigPath;
    }

    const configuration = new Configuration(configurationOptions);

    return await new Promise<LoadedRemarkConfig | undefined>(
        (resolve, reject) => {
            configuration.load(options.targetFilePath, (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }

                if (!isRecord(result) || typeof result.filePath !== "string") {
                    resolve(undefined);
                    return;
                }

                resolve({
                    filePath: normalize(result.filePath),
                    plugins: Array.isArray(result.plugins)
                        ? result.plugins
                        : [],
                    settings: isRecord(result.settings) ? result.settings : {},
                });
            });
        }
    );
}

async function resolveRemarkIgnore(
    basePath: string
): Promise<RemarkIgnoreResolution> {
    const absoluteIgnorePath = await findUp(REMARK_IGNORE_FILENAME, {
        cwd: basePath,
    });

    if (!absoluteIgnorePath) return {};

    const raw = await readFile(absoluteIgnorePath, "utf8");
    const patterns = raw
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));

    return {
        info: {
            path: toRelativePath(basePath, absoluteIgnorePath),
            patterns,
        },
        absolutePath: normalize(absoluteIgnorePath),
    };
}

async function resolveMatchedFiles(
    configs: FlatConfigItem[],
    basePath: string,
    diagnostics: string[]
): Promise<MatchedFile[]> {
    const declaredGlobs = [
        ...new Set(configs.flatMap((config) => config.files ?? [])),
    ]
        .filter((glob) => glob.length > 0)
        .toSorted((left, right) => left.localeCompare(right));

    const hasGeneralConfig = configs.some((config) => isGeneralConfig(config));

    const scanGlobs = hasGeneralConfig
        ? [...new Set([...declaredGlobs, ...DEFAULT_WORKSPACE_SCAN_GLOBS])]
        : declaredGlobs;

    if (hasGeneralConfig) {
        diagnostics.push(
            `${MARK_INFO} General config detected; scanning default markdown globs.`
        );
    }

    if (scanGlobs.length === 0) return [];

    const files = (
        await glob(scanGlobs, {
            cwd: basePath,
            onlyFiles: true,
            absolute: false,
            expandDirectories: false,
            ignore: DEFAULT_WORKSPACE_SCAN_IGNORES,
        })
    )
        .slice(0, MAX_WORKSPACE_MATCHED_FILES)
        .toSorted((left, right) => left.localeCompare(right));

    return files
        .map((filepath) => matchFile(filepath, configs, basePath))
        .filter(
            (matched) => matched.configs.length > 0 || matched.globs.length > 0
        );
}

export function createRemarkInspectorAdapter(): InspectorAdapter {
    return {
        engine: "remark",
        async resolveConfigPath(
            options: ResolveConfigPathOptions
        ): Promise<ResolvedConfigPath> {
            const resolved = await resolveConfigPathInternal(options);
            const { cwd } = options;

            return {
                ...resolved,
                ...(resolved.configPath
                    ? {
                          configPath: toRelativePath(cwd, resolved.configPath),
                      }
                    : {}),
            };
        },
        async readConfig(
            options: ReadConfigOptions
        ): Promise<InspectorReadResult> {
            const resolvedPath = await resolveConfigPathInternal(options);
            const cwd = normalize(options.cwd);
            const { basePath } = resolvedPath;

            if (options.chdir !== false) {
                try {
                    process.chdir(basePath);
                } catch (error) {
                    if (!isWorkerUnsupportedChdirError(error)) throw error;
                }
            }

            const targetFilePath = normalize(
                options.targetFilePath ?? DEFAULT_TARGET_FILE
            );
            const absoluteTargetFilePath = isAbsolute(targetFilePath)
                ? targetFilePath
                : normalize(resolve(basePath, targetFilePath));

            const loaded = await loadRemarkConfig({
                cwd: basePath,
                targetFilePath: absoluteTargetFilePath,
                ...(resolvedPath.absoluteConfigPath
                    ? { absoluteConfigPath: resolvedPath.absoluteConfigPath }
                    : {}),
            });

            if (!loaded) throw new ConfigPathError(basePath, configFilenames);

            const pluginPackages = new Set<string>();
            const configuredRules: RulesRecord = {};
            const rules: Record<string, RuleInfo> = {};
            const presetSpecifiers = new Set<string>();
            const configuredRuleNames = new Set<string>();

            for (const pluginEntry of loaded.plugins) {
                const [plugin, ...parameters] =
                    normalizePluginEntry(pluginEntry);
                const pluginId = extractPluginId(plugin);
                if (!pluginId) continue;

                pluginPackages.add(pluginId);

                if (isRemarkPreset(pluginId)) presetSpecifiers.add(pluginId);

                if (!isRemarkLintRule(pluginId)) continue;

                configuredRules[pluginId] = toRuleValue(parameters);
                configuredRuleNames.add(pluginId);
            }

            const ruleDocsByName = new Map<string, RuleDocsResolution>(
                await Promise.all(
                    [...configuredRuleNames].map(
                        async (ruleName) =>
                            [
                                ruleName,
                                await resolveRuleDocs(ruleName, basePath),
                            ] as const
                    )
                )
            );

            for (const ruleName of configuredRuleNames) {
                const docs = ruleDocsByName.get(ruleName) ?? {
                    url: inferRuleDocsUrl(ruleName),
                    urlSource: "inferred" as const,
                };

                rules[ruleName] = createRuleInfo(ruleName, docs);
            }

            const pluginMap = Object.fromEntries(
                [...pluginPackages]
                    .toSorted((left, right) => left.localeCompare(right))
                    .map((pluginName) => [pluginName, true])
            );

            const rootConfig: FlatConfigItem = {
                index: 0,
                name: "remark/root",
                ...(Object.keys(pluginMap).length > 0
                    ? { plugins: pluginMap }
                    : {}),
                ...(Object.keys(configuredRules).length > 0
                    ? { rules: configuredRules }
                    : {}),
                ...(Object.keys(loaded.settings).length > 0
                    ? { settings: loaded.settings }
                    : {}),
                ...(presetSpecifiers.size > 0
                    ? {
                          extends: [...presetSpecifiers].toSorted(
                              (left, right) => left.localeCompare(right)
                          ),
                      }
                    : {}),
            };

            const configs: FlatConfigItem[] = [rootConfig];
            const diagnostics: string[] = [];

            const files = options.globMatchedFiles
                ? await resolveMatchedFiles(configs, basePath, diagnostics)
                : undefined;

            const remarkIgnore = await resolveRemarkIgnore(basePath);
            const dependencies = new Set<string>([loaded.filePath]);
            if (remarkIgnore.absolutePath)
                dependencies.add(remarkIgnore.absolutePath);

            const extendsInfo = [...presetSpecifiers]
                .toSorted((left, right) => left.localeCompare(right))
                .map((specifier) => {
                    const usedByConfigIndexes = configs
                        .filter((config) => config.extends?.includes(specifier))
                        .map((config) => config.index)
                        .toSorted((left, right) => left - right);

                    return createPresetExtendsInfo({
                        specifier,
                        basePath,
                        usedByConfigIndexes,
                    });
                });

            const resolvedExtendsInfo = await Promise.all(extendsInfo);

            const payload: Payload = {
                configs,
                rules,
                meta: {
                    engine: "remark",
                    targetFilePath,
                    lastUpdate: Date.now(),
                    basePath,
                    configPath: toRelativePath(cwd, loaded.filePath),
                    ...(remarkIgnore.info
                        ? { ignoreFile: remarkIgnore.info }
                        : {}),
                },
                ...(files ? { files } : {}),
                ...(resolvedExtendsInfo.length > 0
                    ? { extendsInfo: resolvedExtendsInfo }
                    : {}),
                ...(diagnostics.length > 0
                    ? {
                          diagnostics: [
                              ...diagnostics,
                              `${MARK_CHECK} Loaded remark config`,
                          ],
                      }
                    : { diagnostics: [`${MARK_CHECK} Loaded remark config`] }),
            };

            return {
                configs,
                payload,
                dependencies: [...dependencies],
            };
        },
    };
}
