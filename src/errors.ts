import c from "ansis";
import { MARK_ERROR } from "./constants";

export class ConfigInspectorError extends Error {
    prettyPrint(): void {
        console.error(MARK_ERROR, this.message);
    }
}

export class ConfigPathError extends ConfigInspectorError {
    override name = "ConfigPathError" as const;

    constructor(
        public basePath: string,
        public configFilenames: readonly string[]
    ) {
        super("Cannot find Remark config file");
    }

    override prettyPrint(): void {
        console.error(
            MARK_ERROR,
            this.message,
            c.dim(`

Looked in ${c.underline(this.basePath)} and parent folders for:

 * ${this.configFilenames.join("\n * ")}`)
        );
    }
}

export class ConfigPathLegacyError extends ConfigInspectorError {
    override name = "ConfigPathLegacyError" as const;

    constructor(
        public basePath: string,
        public configFilename: string
    ) {
        super("Found legacy Remark config file");
    }

    override prettyPrint(): void {
        console.error(
            MARK_ERROR,
            this.message,
            c.dim(`

Encountered legacy Remark config ${c.underline(this.configFilename)} in ${c.underline(this.basePath)}

Prefer modern remark config filenames:
https://github.com/remarkjs/remark/tree/main/packages/remark-cli#example-config-files-json-yaml-js`)
        );
    }
}
