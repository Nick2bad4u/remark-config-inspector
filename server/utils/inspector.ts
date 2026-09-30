import type { WsServerHandle } from "~~/src/ws";
import process from "node:process";
import { createWsServer } from "~~/src/ws";

let session: Promise<WsServerHandle> | undefined;

export function getInspectorSession(): Promise<WsServerHandle> {
    if (!session) {
        const config = process.env.REMARK_CONFIG;
        const basePath = process.env.REMARK_BASE_PATH;
        const target = process.env.REMARK_TARGET;
        session = createWsServer({
            cwd: process.cwd(),
            chdir: false,
            ...(config ? { userConfigPath: config } : {}),
            ...(basePath ? { userBasePath: basePath } : {}),
            ...(target ? { targetFilePath: target } : {}),
        }).catch((error: unknown) => {
            session = undefined;
            throw error;
        });
    }
    return session;
}

export async function closeInspectorSession(): Promise<void> {
    const current = session;
    session = undefined;
    if (current) await (await current).close();
}
