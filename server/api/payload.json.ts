import process from "node:process";
import { createWsServer } from "~~/src/ws";

function getEnvValueWithLegacy(
    primary: string,
    legacy: string
): string | undefined {
    const primaryValue = process.env[primary];
    if (typeof primaryValue === "string" && primaryValue.length > 0)
        return primaryValue;

    const legacyValue = process.env[legacy];
    if (typeof legacyValue === "string" && legacyValue.length > 0)
        return legacyValue;

    return undefined;
}

export default lazyEventHandler(async () => {
    const userConfigPath = getEnvValueWithLegacy(
        "REMARK_CONFIG",
        "ESLINT_CONFIG"
    );
    const userBasePath = getEnvValueWithLegacy(
        "REMARK_BASE_PATH",
        "ESLINT_BASE_PATH"
    );
    const targetFilePath = getEnvValueWithLegacy(
        "REMARK_TARGET",
        "ESLINT_TARGET"
    );

    const ws = await createWsServer({
        cwd: process.cwd(),
        chdir: false,
        ...(userConfigPath ? { userConfigPath } : {}),
        ...(userBasePath ? { userBasePath } : {}),
        ...(targetFilePath ? { targetFilePath } : {}),
    });

    return defineEventHandler(() => {
        return ws.getData();
    });
});
