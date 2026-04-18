import process from "node:process";
import { createWsServer } from "~~/src/ws";

function getEnvValue(name: string): string | undefined {
    const value = process.env[name];
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

export default lazyEventHandler(async () => {
    const userConfigPath = getEnvValue("REMARK_CONFIG");
    const userBasePath = getEnvValue("REMARK_BASE_PATH");
    const targetFilePath = getEnvValue("REMARK_TARGET");

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
