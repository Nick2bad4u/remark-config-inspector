import type { Payload } from "../shared/types";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import process from "node:process";
import { getPort } from "get-port-please";
import { join } from "pathe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigPathError } from "../src/errors";

const readConfigMock = vi.fn();
const resolveConfigPathMock = vi.fn();
const runStatsMock = vi.fn<typeof import("../src/stats/runner").runStats>();

interface ClosableServer {
    close: () => Promise<void>;
}

vi.mock("../src/configs", () => ({
    readConfig: readConfigMock,
    resolveConfigPath: resolveConfigPathMock,
}));

vi.mock("../src/stats/runner", () => ({ runStats: runStatsMock }));

vi.mock("get-port-please", async (importOriginal) => {
    const actual = await importOriginal<typeof import("get-port-please")>();
    return { ...actual, getPort: vi.fn(actual.getPort) };
});

const tempDirs: string[] = [];

async function closeServer(server: ClosableServer): Promise<void> {
    await server.close();
}

afterEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    runStatsMock.mockReset();
    await Promise.all(
        tempDirs.map((dir) => rm(dir, { recursive: true, force: true }))
    );
});

describe("ws payload and server contract", () => {
    it("closes the watcher, active analysis, and connected websocket clients through the public lifecycle", async () => {
        const cwd = await mkdtemp(
            join(tmpdir(), "remark-config-inspector-ws-")
        );
        tempDirs.push(cwd);
        resolveConfigPathMock.mockResolvedValue({
            basePath: cwd,
            configPath: join(cwd, ".remarkrc.mjs"),
        });
        runStatsMock.mockImplementation(
            (_options, runOptions) =>
                new Promise((_resolve, reject) => {
                    runOptions?.signal?.addEventListener(
                        "abort",
                        () => reject(new Error("Analysis cancelled")),
                        { once: true }
                    );
                })
        );
        const { createWsServer } = await import("../src/ws");
        const { WebSocket } = await import("ws");
        const server = await createWsServer({
            cwd,
            chdir: false,
            globMatchedFiles: false,
        });
        const watcherClose = vi.spyOn(server.watcher, "close");
        const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
        let closed = false;
        try {
            await once(ws, "open");
            server.stats.run();
            await vi.waitFor(() => expect(runStatsMock).toHaveBeenCalledOnce());
            const signal = runStatsMock.mock.calls[0]?.[1]?.signal;
            expect(signal?.aborted).toBe(false);
            const clientClosed = once(ws, "close");
            const connectedClient = server.wss.clients.values().next().value;
            if (!connectedClient)
                throw new Error("Expected a connected server-side websocket");
            const serverClientClosed = once(connectedClient, "close");
            await server.close();
            closed = true;
            await Promise.all([clientClosed, serverClientClosed]);
            expect(signal?.aborted).toBe(true);
            expect(watcherClose).toHaveBeenCalledOnce();
            expect(ws.readyState).toBe(WebSocket.CLOSED);
            expect(server.wss.clients.size).toBe(0);
            expect(server.wss.address()).toBeNull();
            expect(() => server.stats.run()).toThrow(
                "The inspector session has closed."
            );
        } finally {
            ws.terminate();
            if (!closed) await closeServer(server);
        }
    });

    it("rejects public close when the websocket server reports a shutdown error", async () => {
        const cwd = await mkdtemp(
            join(tmpdir(), "remark-config-inspector-ws-")
        );
        tempDirs.push(cwd);
        resolveConfigPathMock.mockResolvedValue({
            basePath: cwd,
            configPath: join(cwd, ".remarkrc.mjs"),
        });
        const { createWsServer } = await import("../src/ws");
        const server = await createWsServer({
            cwd,
            chdir: false,
            globMatchedFiles: false,
        });
        const shutdownError = new Error("Websocket shutdown failed");
        const closeSpy = vi
            .spyOn(server.wss, "close")
            .mockImplementationOnce((callback) => callback?.(shutdownError));
        try {
            await expect(server.close()).rejects.toBe(shutdownError);
            expect(() => server.stats.run()).toThrow(
                "The inspector session has closed."
            );
        } finally {
            closeSpy.mockRestore();
            await closeServer(server);
        }
    });

    it("returns a valid payload shape when readConfig throws generic errors", async () => {
        const cwd = await mkdtemp(
            join(tmpdir(), "remark-config-inspector-ws-")
        );
        tempDirs.push(cwd);
        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);

        resolveConfigPathMock.mockResolvedValue({
            basePath: cwd,
            configPath: join(cwd, ".remarkrc.mjs"),
        });
        readConfigMock.mockRejectedValue(new Error("broken config"));

        const { createWsServer } = await import("../src/ws");
        const server = await createWsServer({
            cwd,
            chdir: false,
            globMatchedFiles: false,
            targetFilePath: "docs/index.md",
        });

        try {
            const data = await server.getData();

            expect(data.configs).toEqual([]);
            expect(data.rules).toEqual({});
            expect(data.meta.engine).toBe("remark");
            expect(data.meta.basePath).toBe(cwd);
            expect(data.meta.configPath).toBe(".remarkrc.mjs");
            expect(data.meta.targetFilePath).toBe("docs/index.md");
            expect(data.diagnostics?.[0]).toContain(
                "Failed to load Remark configuration"
            );
            expect(
                data.diagnostics?.some((note: string) =>
                    note.includes("broken config")
                )
            ).toBe(true);
        } finally {
            consoleErrorSpy.mockRestore();
            await closeServer(server);
        }
    });

    it("caches payloads, invalidates on watcher change, and notifies websocket clients", async () => {
        const cwd = await mkdtemp(
            join(tmpdir(), "remark-config-inspector-ws-")
        );
        tempDirs.push(cwd);

        resolveConfigPathMock.mockResolvedValue({
            basePath: cwd,
            configPath: join(cwd, ".remarkrc.mjs"),
        });

        const payloadOne: Payload = {
            configs: [],
            rules: {},
            diagnostics: [],
            meta: {
                lastUpdate: 1,
                basePath: cwd,
                configPath: ".remarkrc.mjs",
                engine: "remark",
            },
        };

        const payloadTwo: Payload = {
            configs: [],
            rules: {},
            diagnostics: [],
            meta: {
                lastUpdate: 2,
                basePath: cwd,
                configPath: ".remarkrc.mjs",
                engine: "remark",
            },
        };

        readConfigMock
            .mockResolvedValueOnce({
                payload: payloadOne,
                dependencies: [join(cwd, ".remarkrc.mjs")],
                configs: [],
            })
            .mockResolvedValueOnce({
                payload: payloadTwo,
                dependencies: [join(cwd, "package.json")],
                configs: [],
            });

        const { createWsServer } = await import("../src/ws");
        const server = await createWsServer({
            cwd,
            chdir: false,
            globMatchedFiles: false,
        });

        const { WebSocket } = await import("ws");
        const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);

        try {
            await new Promise<void>((resolve, reject) => {
                ws.once("open", () => resolve());
                ws.once("error", (error) => reject(error));
            });

            const first = await server.getData();
            expect(first.meta.wsPort).toBe(server.port);
            expect(readConfigMock).toHaveBeenCalledTimes(1);

            const second = await server.getData();
            expect(second).toBe(first);
            expect(readConfigMock).toHaveBeenCalledTimes(1);

            const messagePromise = new Promise<string>((resolve, reject) => {
                ws.once("message", (data) => resolve(data.toString()));
                ws.once("error", (error) => reject(error));
            });

            server.watcher.emit("change", ".remarkrc.mjs");
            const message = JSON.parse(await messagePromise) as {
                type: string;
                path: string;
            };

            expect(message).toEqual({
                type: "config-change",
                path: ".remarkrc.mjs",
            });

            const third = await server.getData();
            expect(third.meta.lastUpdate).toBe(2);
            expect(readConfigMock).toHaveBeenCalledTimes(2);
        } finally {
            ws.close();
            await new Promise<void>((resolve) =>
                ws.once("close", () => resolve())
            );
            await closeServer(server);
        }
    });

    it("prints ConfigInspectorError details when readConfig throws a typed config error", async () => {
        const cwd = await mkdtemp(
            join(tmpdir(), "remark-config-inspector-ws-")
        );
        tempDirs.push(cwd);

        resolveConfigPathMock.mockResolvedValue({
            basePath: cwd,
            configPath: join(cwd, ".remarkrc.mjs"),
        });

        const typedError = new ConfigPathError(cwd, [".remarkrc"]);
        const prettyPrintSpy = vi.spyOn(typedError, "prettyPrint");
        const consoleErrorSpy = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);

        readConfigMock.mockRejectedValue(typedError);

        const { createWsServer } = await import("../src/ws");
        const server = await createWsServer({
            cwd,
            chdir: false,
            globMatchedFiles: false,
        });

        try {
            const payload = await server.getData();

            expect(prettyPrintSpy).toHaveBeenCalledOnce();
            expect(
                payload.diagnostics?.some((line) =>
                    line.includes("Cannot find Remark config file")
                )
            ).toBe(true);
        } finally {
            consoleErrorSpy.mockRestore();
            await closeServer(server);
        }
    });

    it("exits when resolveConfigPath throws ConfigInspectorError during startup", async () => {
        const cwd = await mkdtemp(
            join(tmpdir(), "remark-config-inspector-ws-")
        );
        tempDirs.push(cwd);

        const resolveError = new ConfigPathError(cwd, [".remarkrc"]);
        const prettyPrintSpy = vi.spyOn(resolveError, "prettyPrint");
        resolveConfigPathMock.mockRejectedValue(resolveError);

        const exitError = new Error("__EXIT__");
        vi.spyOn(process, "exit").mockImplementation(() => {
            throw exitError;
        });

        const { createWsServer } = await import("../src/ws");

        await expect(
            createWsServer({
                cwd,
                chdir: false,
                globMatchedFiles: false,
            })
        ).rejects.toBe(exitError);
        expect(prettyPrintSpy).toHaveBeenCalledOnce();
        expect(getPort).not.toHaveBeenCalled();
    });

    it("rethrows unexpected resolveConfigPath startup errors", async () => {
        const cwd = await mkdtemp(
            join(tmpdir(), "remark-config-inspector-ws-")
        );
        tempDirs.push(cwd);

        const startupError = new Error("unexpected-startup-failure");
        resolveConfigPathMock.mockRejectedValue(startupError);

        const { createWsServer } = await import("../src/ws");

        await expect(
            createWsServer({
                cwd,
                chdir: false,
                globMatchedFiles: false,
            })
        ).rejects.toBe(startupError);
        expect(getPort).not.toHaveBeenCalled();
    });
});
