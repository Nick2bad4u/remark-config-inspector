import type {
    InspectorReadResult,
    ReadConfigOptions,
    ResolveConfigPathOptions,
    ResolvedConfigPath,
} from "./inspectors/contracts";
import { createRemarkInspectorAdapter } from "./inspectors/remark";

const adapter = createRemarkInspectorAdapter();

export type { ReadConfigOptions, ResolveConfigPathOptions };

/**
 * Alias for inspector config read results.
 */
export type InspectorConfig = InspectorReadResult;

/**
 * Search and resolve the remark config location metadata.
 */
export function resolveConfigPath(
    options: ResolveConfigPathOptions
): Promise<ResolvedConfigPath> {
    return adapter.resolveConfigPath(options);
}

/**
 * Read and normalize the remark config into inspector payload.
 */
export function readConfig(
    options: ReadConfigOptions
): Promise<InspectorReadResult> {
    return adapter.readConfig(options);
}
