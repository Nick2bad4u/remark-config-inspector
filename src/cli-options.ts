import process from "node:process";
import { DEFAULT_TARGET_FILE } from "./constants";

export interface CliInspectorOptions {
    basePath?: string;
    config?: string;
    file?: string;
    target?: string;
}

function getEnvValueWithLegacy(
    primary: string,
    legacy: string
): string | undefined {
    return process.env[primary] || process.env[legacy];
}

/**
 * Normalizes CLI options so explicit flags win over env vars, `--file` works as
 * a true alias for `--target`, and the inspector keeps a stable default target
 * when neither is supplied.
 */
export function normalizeCliInspectorOptions<T extends CliInspectorOptions>(
    options: T
): T & Required<Pick<CliInspectorOptions, "target">> {
    return {
        ...options,
        config:
            options.config ??
            getEnvValueWithLegacy("REMARK_CONFIG", "ESLINT_CONFIG"),
        basePath:
            options.basePath ??
            getEnvValueWithLegacy("REMARK_BASE_PATH", "ESLINT_BASE_PATH"),
        target:
            options.target ??
            options.file ??
            getEnvValueWithLegacy("REMARK_TARGET", "ESLINT_TARGET") ??
            DEFAULT_TARGET_FILE,
    };
}
