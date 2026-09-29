import type { ReadConfigOptions } from "../inspectors/contracts";
import process from "node:process";
import { profileWorkspace } from "./profile";

function isStartMessage(
    value: unknown
): value is { type: "start"; options: ReadConfigOptions } {
    if (
        !value ||
        typeof value !== "object" ||
        !("type" in value) ||
        value.type !== "start" ||
        !("options" in value)
    )
        return false;
    const options = value.options;
    if (
        !options ||
        typeof options !== "object" ||
        !("cwd" in options) ||
        typeof options.cwd !== "string"
    )
        return false;
    return [
        "userConfigPath",
        "userBasePath",
        "targetFilePath",
    ].every(
        (key) =>
            !(key in options) || typeof Reflect.get(options, key) === "string"
    );
}

function finish(message: object): void {
    if (process.send) process.send(message, () => process.exit(0));
    else process.exit(1);
}

process.once("message", (message: unknown) => {
    if (!isStartMessage(message)) {
        finish({ type: "error", message: "Invalid profiling request" });
        return;
    }
    profileWorkspace(message.options, (progress) =>
        process.send?.({ type: "progress", progress })
    ).then(
        (report) => finish({ type: "result", report }),
        (error: unknown) =>
            finish({
                type: "error",
                message: error instanceof Error ? error.message : String(error),
            })
    );
});
// Terminate even when project plugins leave timers running after the parent
// disappears (for example, Windows TerminateProcess on the inspector server).
process.once("disconnect", () => process.exit(1));
