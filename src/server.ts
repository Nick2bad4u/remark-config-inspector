import type { Server } from "node:http";
import type { CreateWsServerOptions } from "./ws";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import {
    createApp,
    eventHandler,
    getRequestHeader,
    getRequestProtocol,
    serveStatic,
    setResponseHeader,
} from "h3";
import { toNodeHandler } from "h3/node";
import { lookup } from "mrmime";
import { extname, join } from "pathe";
import { distDir } from "./dirs";
import { handleStatsAction } from "./stats/http";
import { createWsServer } from "./ws";

const LEADING_SLASHES_RE = /^\/+/;

export async function createHostServer(
    options: CreateWsServerOptions
): Promise<Server> {
    const app = createApp();

    const ws = await createWsServer(options);

    const fileMap = new Map<string, Promise<Uint8Array | undefined>>();
    const readCachedFile = (id: string) => {
        if (!fileMap.has(id)) {
            fileMap.set(
                id,
                readFile(id).catch(() => undefined)
            );
        }
        return fileMap.get(id);
    };

    const resolveDistFilePath = (
        id: string
    ): { relative: string; absolute: string } | undefined => {
        const cleanId = id
            .split("?")[0]
            ?.split("#")[0]
            ?.replace(LEADING_SLASHES_RE, "");

        if (!cleanId) return;

        return {
            relative: cleanId,
            absolute: join(distDir, cleanId),
        };
    };

    const shouldServeIndexFallback = (path: string): boolean => {
        if (path === "/") return true;

        if (path.startsWith("/_nuxt/") || path.startsWith("/api/"))
            return false;

        return extname(path) === "";
    };

    app.use(
        "/api/payload.json",
        eventHandler(() => ws.getData())
    );

    for (const action of [
        "status",
        "run",
        "cancel",
    ] as const) {
        app.use(
            `/api/stats/${action}`,
            eventHandler((event) => {
                setResponseHeader(event, "Cache-Control", "no-store");
                const origin = getRequestHeader(event, "origin");
                const host = getRequestHeader(event, "host");
                return handleStatsAction(ws.stats, action, {
                    method: event.method,
                    protocol: getRequestProtocol(event, {
                        xForwardedProto: false,
                    }),
                    ...(origin ? { origin } : {}),
                    ...(host ? { host } : {}),
                });
            })
        );
    }

    app.use(
        eventHandler(async (event) => {
            const indexHtml = await readCachedFile(join(distDir, "index.html"));

            if (event.path === "/" && indexHtml) {
                setResponseHeader(
                    event,
                    "Content-Type",
                    "text/html; charset=UTF-8"
                );
                return indexHtml;
            }

            const result = await serveStatic(event, {
                fallthrough: true,
                getContents: (id) => {
                    if (!id) return undefined;

                    const resolved = resolveDistFilePath(id);
                    if (!resolved) return undefined;

                    return readCachedFile(resolved.absolute);
                },
                getMeta: async (id) => {
                    if (!id) return;

                    const resolved = resolveDistFilePath(id);
                    if (!resolved) return;

                    const stats = await stat(resolved.absolute).catch(() => {});
                    if (!stats?.isFile()) return;

                    const mimeType = lookup(resolved.relative);
                    return {
                        ...(mimeType !== undefined && { type: mimeType }),
                        size: stats.size,
                        mtime: stats.mtimeMs,
                    };
                },
            });

            if (!result && shouldServeIndexFallback(event.path)) {
                if (indexHtml) {
                    setResponseHeader(
                        event,
                        "Content-Type",
                        "text/html; charset=UTF-8"
                    );
                }
                return indexHtml;
            }

            return result;
        })
    );

    const server = createServer(toNodeHandler(app));
    server.on("close", () => {
        void ws.close().catch((error: unknown) => console.error(error));
    });
    return server;
}
