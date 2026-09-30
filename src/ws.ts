import type { FSWatcher } from "chokidar";
import type { WebSocket, WebSocketServer as WebSocketServerType } from "ws";
import type { Payload } from "~~/shared/types";
import type { ReadConfigOptions } from "./configs";
import type { StatsService } from "./stats/service";
import process from "node:process";
import chokidar from "chokidar";
import { getPort } from "get-port-please";
import { normalize, relative } from "pathe";
import { WebSocketServer } from "ws";
import { readConfig, resolveConfigPath } from "./configs";
import { MARK_CHECK } from "./constants";
import { ConfigInspectorError } from "./errors";
import { createStatsService } from "./stats/service";

const readErrorWarning = `Failed to load Remark configuration.
Please ensure a valid remark config can be resolved:
https://github.com/remarkjs/remark/tree/main/packages/remark-cli#example-config-files-json-yaml-js`;

export interface CreateWsServerOptions extends ReadConfigOptions {}

export interface WsServerHandle {
    port: number;
    wss: WebSocketServerType;
    watcher: FSWatcher;
    getData: () => Promise<Payload | undefined>;
    stats: StatsService;
    close: () => Promise<void>;
}

export async function createWsServer(
    options: CreateWsServerOptions
): Promise<WsServerHandle> {
    let payload: Payload | undefined;
    let resolvedConfigPath: Awaited<ReturnType<typeof resolveConfigPath>>;
    try {
        resolvedConfigPath = await resolveConfigPath(options);
    } catch (e) {
        if (e instanceof ConfigInspectorError) {
            e.prettyPrint();
            process.exit(1);
        } else {
            throw e;
        }
    }

    const { basePath } = resolvedConfigPath;
    const stats = createStatsService(options);
    const port = await getPort({ port: 7811, random: true });
    const wss = new WebSocketServer({ port });
    const wsClients = new Set<WebSocket>();

    wss.on("connection", (ws) => {
        wsClients.add(ws);
        console.log(MARK_CHECK, "Websocket client connected");
        ws.on("close", () => wsClients.delete(ws));
    });

    function toRelativePath(path: string): string {
        const result = relative(options.cwd, path).replaceAll("\\", "/");
        return result.length ? result : normalize(path).replaceAll("\\", "/");
    }

    function createErrorPayload(error: unknown): Payload {
        const diagnostic =
            error instanceof Error ? error.message : String(error);

        return {
            configs: [],
            rules: {},
            diagnostics: [readErrorWarning, diagnostic],
            meta: {
                wsPort: port,
                engine: "remark",
                ...(options.targetFilePath !== undefined && {
                    targetFilePath: options.targetFilePath,
                }),
                lastUpdate: Date.now(),
                basePath,
                configPath: resolvedConfigPath.configPath
                    ? toRelativePath(resolvedConfigPath.configPath)
                    : "",
            },
        };
    }

    const watcher = chokidar.watch([], {
        ignoreInitial: true,
        cwd: basePath,
    });

    watcher.on("change", (path) => {
        payload = undefined;
        stats.invalidate();
        console.log();
        console.log(MARK_CHECK, "Config change detected", path);
        wsClients.forEach((ws) => {
            ws.send(
                JSON.stringify({
                    type: "config-change",
                    path,
                })
            );
        });
    });

    async function getData() {
        try {
            if (!payload) {
                return await readConfig(options).then((res) => {
                    const _payload = (payload = res.payload);
                    _payload.meta.wsPort = port;
                    _payload.meta.statsAvailable = true;
                    watcher.add(res.dependencies);
                    return payload;
                });
            }
            return payload;
        } catch (e) {
            console.error(readErrorWarning);
            if (e instanceof ConfigInspectorError) {
                e.prettyPrint();
            } else {
                console.error(e);
            }
            return createErrorPayload(e);
        }
    }

    return {
        port,
        wss,
        watcher,
        getData,
        stats,
        async close() {
            stats.close();
            await watcher.close();
            for (const client of wsClients) client.terminate();
            await new Promise<void>((resolve, reject) => {
                wss.close((error) => (error ? reject(error) : resolve()));
            });
        },
    };
}
