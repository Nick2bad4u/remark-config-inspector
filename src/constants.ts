import c from "ansis";

export const remarkConfigFilenames: readonly string[] = [
    ".remarkrc",
    ".remarkrc.cjs",
    ".remarkrc.json",
    ".remarkrc.js",
    ".remarkrc.mjs",
    ".remarkrc.yaml",
    ".remarkrc.yml",
    "package.json",
];

export const remarkLegacyConfigFilenames: readonly string[] = [];

export const configFilenames: readonly string[] = remarkConfigFilenames;
export const legacyConfigFilenames: readonly string[] =
    remarkLegacyConfigFilenames;
export const DEFAULT_TARGET_FILE = "remark-inspector-target.md";

export const MARK_CHECK: string = c.green("✔");
export const MARK_INFO: string = c.blue("ℹ");
export const MARK_ERROR: string = c.red("✖");
