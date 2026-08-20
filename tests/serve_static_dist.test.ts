import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getRandomPort } from "get-port-please";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

interface HttpResult {
    body: string;
    statusCode: number | undefined;
}

function waitForServer(child: ChildProcessWithoutNullStreams): Promise<void> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () =>
                reject(new Error("Static test server did not start in time.")),
            10_000
        );

        const onExit = (code: number | null): void => {
            clearTimeout(timeout);
            reject(
                new Error(`Static test server exited before startup (${code}).`)
            );
        };

        child.once("exit", onExit);
        child.stdout.on("data", (chunk: Buffer) => {
            if (!chunk.toString().includes("Serving ")) return;

            clearTimeout(timeout);
            child.off("exit", onExit);
            resolve();
        });
    });
}

function requestRawPath(port: number, path: string): Promise<HttpResult> {
    return new Promise((resolve, reject) => {
        const outgoingRequest = request(
            {
                host: "127.0.0.1",
                method: "GET",
                path,
                port,
            },
            (response) => {
                const chunks: Buffer[] = [];
                response.on("data", (chunk: Buffer) => chunks.push(chunk));
                response.on("end", () => {
                    resolve({
                        body: Buffer.concat(chunks).toString("utf8"),
                        statusCode: response.statusCode,
                    });
                });
            }
        );
        outgoingRequest.once("error", reject);
        outgoingRequest.end();
    });
}

describe("static distribution server path containment", () => {
    let child: ChildProcessWithoutNullStreams;
    let port: number;
    let temporaryRoot: string;

    beforeAll(async () => {
        temporaryRoot = await mkdtemp(join(tmpdir(), "remark-static-server-"));
        const publicRoot = join(temporaryRoot, "public");
        const outsideRoot = join(temporaryRoot, "outside");
        await mkdir(publicRoot);
        await mkdir(outsideRoot);
        await writeFile(join(publicRoot, "index.html"), "safe index");
        await writeFile(join(outsideRoot, "secret.txt"), "outside secret");
        await symlink(
            outsideRoot,
            join(publicRoot, "escape"),
            process.platform === "win32" ? "junction" : "dir"
        );

        port = await getRandomPort("127.0.0.1");
        child = spawn(
            process.execPath,
            [
                "scripts/serve-static-dist.mjs",
                "--host",
                "127.0.0.1",
                "--port",
                String(port),
                "--dir",
                publicRoot,
            ],
            {
                cwd: repositoryRoot,
                stdio: [
                    "ignore",
                    "pipe",
                    "pipe",
                ],
            }
        );
        await waitForServer(child);
    });

    afterAll(async () => {
        child.kill();
        await new Promise<void>((resolve) =>
            child.once("exit", () => resolve())
        );
        await rm(temporaryRoot, { force: true, recursive: true });
    });

    it("serves files inside the configured root", async () => {
        const result = await requestRawPath(port, "/");
        expect(result).toEqual({ body: "safe index", statusCode: 200 });
    });

    it("rejects paths that escape through a symbolic link", async () => {
        const result = await requestRawPath(port, "/escape/secret.txt");
        expect(result.statusCode).toBe(404);
        expect(result.body).not.toContain("outside secret");
    });

    it.each(["/../outside/secret.txt", "/%2e%2e/outside/secret.txt"])(
        "rejects traversal path %s",
        async (path) => {
            const result = await requestRawPath(port, path);
            expect(result.statusCode).toBe(404);
            expect(result.body).not.toContain("outside secret");
        }
    );
});
