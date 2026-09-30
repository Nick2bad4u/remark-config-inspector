import type { ChildProcess } from "node:child_process";
import type { StatsJob } from "../../shared/stats";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";
import { getPort } from "get-port-please";
import { lookup } from "mrmime";

const root = fileURLToPath(new URL("../../", import.meta.url));
const markdown = "# Integration fixture\n\nOriginal Markdown stays on disk.\n";

async function createWorkspace() {
    const directory = await mkdtemp(join(tmpdir(), "remark-stats-e2e-"));
    await writeFile(join(directory, "readme.md"), markdown);
    await writeFile(join(directory, "ignored.md"), "# Ignored\n");
    await writeFile(join(directory, ".remarkignore"), "ignored.md\n");
    await writeFile(
        join(directory, ".remarkrc.mjs"),
        `
export default {
    plugins: [function remarkLintIntegration() {
        return function transformer(tree, file) {
            file.message("Integration warning", { line: 1, column: 1 }, "remark-lint:integration");
            tree.children = [];
        };
    }],
};
`
    );
    return directory;
}

function startCli(
    directory: string,
    args: string[],
    entry: "cli.mjs" | "cli.cjs" = "cli.mjs",
    environment: NodeJS.ProcessEnv = {}
) {
    const child = spawn(
        process.execPath,
        [join(root, "dist", entry), ...args],
        {
            cwd: directory,
            env: { ...process.env, ...environment },
            windowsHide: true,
            stdio: [
                "ignore",
                "pipe",
                "pipe",
            ],
        }
    );
    let output = "";
    for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding("utf8");
        stream.on("data", (chunk: string) => {
            output = (output + chunk).slice(-16_384);
        });
    }
    const exited = once(child, "exit");
    return { child, exited, output: () => output };
}

async function stopChild(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill();
    await exited;
}

async function removeWorkspace(directory: string) {
    const expectedParent = resolve(tmpdir());
    const resolved = resolve(directory);
    if (!resolved.startsWith(`${expectedParent}${sep}remark-stats-e2e-`))
        throw new Error(
            `Refusing to remove unexpected test directory: ${resolved}`
        );
    await rm(resolved, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
    });
}

test("build --stats preserves existing output on processing failure and accepts fatal lint findings", async () => {
    const directory = await createWorkspace();
    const outDir = join(directory, "site");
    const sentinel = join(outDir, "existing-output.txt");
    await mkdir(outDir);
    await writeFile(sentinel, "Keep the previous successful deployment.");
    await writeFile(
        join(directory, ".remarkrc.mjs"),
        `
export default {
    plugins: [function throwingPlugin() {
        return function transformer() {
            throw new Error("Fixture transformer failed");
        };
    }],
};
`
    );
    const args = [
        "build",
        "--stats",
        "--config",
        ".remarkrc.mjs",
        "--outDir",
        outDir,
    ];
    let build = startCli(directory, args);
    try {
        const [failedCode] = await build.exited;
        expect(failedCode, build.output()).not.toBe(0);
        expect(failedCode, build.output()).not.toBeNull();
        expect(build.output()).toContain("readme.md");
        expect(build.output()).toContain("Fixture transformer failed");
        expect(build.output()).not.toMatch(
            /UnhandledPromiseRejection|triggerUncaughtException|^\s+at\s/mu
        );
        expect(await readFile(sentinel, "utf8")).toBe(
            "Keep the previous successful deployment."
        );
        await expect(
            readFile(join(outDir, "api/payload.json"), "utf8")
        ).rejects.toMatchObject({ code: "ENOENT" });

        await writeFile(
            join(directory, ".remarkrc.mjs"),
            `
export default {
    plugins: [function remarkLintFatalFinding() {
        return function transformer(_tree, file) {
            file.message("Fatal lint finding", { line: 1, column: 1 }, "remark-lint:integration").fatal = true;
        };
    }],
};
`
        );
        build = startCli(directory, args);
        const [successfulCode] = await build.exited;
        expect(successfulCode, build.output()).toBe(0);
        const payload = JSON.parse(
            await readFile(join(outDir, "api/payload.json"), "utf8")
        ) as { stats: StatsJob["report"] };
        expect(payload.stats).toMatchObject({
            partial: false,
            errorCount: 1,
            warningCount: 0,
        });
        expect(payload.stats?.files).toHaveLength(1);
        expect(payload.stats?.files[0]).toMatchObject({
            filePath: "readme.md",
            failed: false,
            errors: 1,
        });
        expect(payload.stats?.files[0]?.messages).toContainEqual(
            expect.objectContaining({
                reason: "Fatal lint finding",
                fatal: true,
            })
        );
        expect(await readFile(join(directory, "readme.md"), "utf8")).toBe(
            markdown
        );
    } finally {
        await stopChild(build.child);
        await removeWorkspace(directory);
    }
});

test("live --stats explains how to run profiling without an unhandled stack", async () => {
    const directory = await createWorkspace();
    const command = startCli(directory, ["--stats", "--no-open"]);
    try {
        const [code] = await command.exited;
        expect(code, command.output()).toBe(1);
        expect(command.output()).toContain("--stats is a build option");
        expect(command.output()).toContain("build --stats");
        expect(command.output()).toContain("Stats > Run analysis");
        expect(command.output()).not.toContain(
            "Starting remark config inspector"
        );
        expect(command.output()).not.toMatch(
            /UnhandledPromiseRejection|triggerUncaughtException|^\s+at\s/mu
        );
    } finally {
        await stopChild(command.child);
        await removeWorkspace(directory);
    }
});

test("stats workers disable debugger auto-attachment while retaining Node preload hooks", async () => {
    const directory = await createWorkspace();
    const preload = join(directory, "debugger-preload.mjs");
    await writeFile(
        preload,
        `
import { writeFileSync } from "node:fs";
import { Session } from "node:inspector";
import process from "node:process";
process.env.REMARK_STATS_TEST_PRELOAD_PID = String(process.pid);
if (process.env.VSCODE_INSPECTOR_OPTIONS) {
    const session = new Session();
    session.connect();
    session.post("Runtime.enable");
    session.post("Debugger.enable");
    globalThis.remarkStatsTestDebuggerSession = session;
    writeFileSync("debugger-attached-" + process.pid + ".txt", String(process.pid));
}
`
    );
    await writeFile(
        join(directory, ".remarkrc.mjs"),
        `
import process from "node:process";
export default {
    plugins: [function debuggerRegressionPlugin() {
        return function transformer() {
            if (process.env.REMARK_STATS_TEST_PRELOAD_PID !== String(process.pid))
                throw new Error("Worker did not execute the preserved NODE_OPTIONS preload");
            const previousLimit = Error.stackTraceLimit;
            try {
                Error.stackTraceLimit = Infinity;
                const error = new Error("Unlimited stack trace regression fixture");
                if (!error.stack) throw new Error("Missing fixture stack trace");
            } finally {
                Error.stackTraceLimit = previousLimit;
            }
            if (process.env.VSCODE_INSPECTOR_OPTIONS !== undefined)
                throw new Error("Worker inherited debugger auto-attachment settings");
        };
    }],
};
`
    );
    const outDir = join(directory, "site");
    const build = startCli(
        directory,
        [
            "build",
            "--stats",
            "--config",
            ".remarkrc.mjs",
            "--outDir",
            outDir,
        ],
        "cli.mjs",
        {
            NODE_OPTIONS: [
                process.env.NODE_OPTIONS,
                `--import=${pathToFileURL(preload).href}`,
            ]
                .filter(Boolean)
                .join(" "),
            VSCODE_INSPECTOR_OPTIONS: "{}",
        }
    );
    try {
        const [code] = await build.exited;
        expect(code, build.output()).toBe(0);
        expect(
            await readFile(
                join(directory, `debugger-attached-${build.child.pid}.txt`),
                "utf8"
            )
        ).toBe(String(build.child.pid));
        const payload = JSON.parse(
            await readFile(join(outDir, "api/payload.json"), "utf8")
        ) as { stats: StatsJob["report"] };
        expect(payload.stats).toMatchObject({ partial: false, errorCount: 0 });
        expect(payload.stats?.files).toHaveLength(1);
        expect(payload.stats?.files[0]).toMatchObject({
            filePath: "readme.md",
            failed: false,
        });
        expect(await readFile(join(directory, "readme.md"), "utf8")).toBe(
            markdown
        );
    } finally {
        await stopChild(build.child);
        await removeWorkspace(directory);
    }
});

test("profiles through the real CLI server and leaves source files unchanged", async ({
    page,
    request,
}) => {
    const directory = await createWorkspace();
    const port = await getPort({ host: "127.0.0.1" });
    const base = `http://127.0.0.1:${port}`;
    const running = startCli(directory, [
        "--config",
        ".remarkrc.mjs",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--no-open",
    ]);
    const browserErrors: string[] = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    try {
        await expect
            .poll(
                async () => {
                    if (running.child.exitCode !== null)
                        throw new Error(running.output());
                    try {
                        return (
                            await request.get(`${base}/api/stats/status`)
                        ).status();
                    } catch {
                        return 0;
                    }
                },
                { timeout: 20_000 }
            )
            .toBe(200);
        await page.goto(`${base}/stats`);
        await page
            .getByRole("button", { name: "Run analysis", exact: true })
            .click();
        await expect(
            page.getByRole("button", { name: "Re-run analysis" })
        ).toBeVisible();
        await page
            .getByRole("button", { name: "Slow Files", exact: true })
            .click();
        await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(
            1
        );
        await expect(page.getByRole("table")).toContainText("readme.md");
        const response = await request.get(`${base}/api/stats/status`);
        const job = (await response.json()) as StatsJob;
        expect(job.status).toBe("complete");
        expect(job.report?.files.map((file) => file.filePath)).toEqual([
            "readme.md",
        ]);
        expect(job.report?.warningCount).toBe(1);
        expect(job.report?.files[0]?.plugins.length).toBeGreaterThan(0);
        await page.getByRole("button", { name: "Re-run analysis" }).click();
        await expect
            .poll(async () => {
                const next = await request.get(`${base}/api/stats/status`);
                const nextJob = (await next.json()) as StatsJob;
                return (
                    nextJob.status === "complete" &&
                    (nextJob.startedAt ?? 0) > (job.startedAt ?? 0)
                );
            })
            .toBe(true);
        await expect(
            page.getByRole("button", { name: "Re-run analysis" })
        ).toBeVisible();
        expect(await readFile(join(directory, "readme.md"), "utf8")).toBe(
            markdown
        );
        expect(browserErrors).toEqual([]);
    } finally {
        await stopChild(running.child);
        await removeWorkspace(directory);
    }
});

test("cancels an executing worker even when a plugin handles SIGTERM", async ({
    page,
    request,
}) => {
    const directory = await createWorkspace();
    await writeFile(
        join(directory, ".remarkrc.mjs"),
        `
import { writeFileSync } from "node:fs";
import process from "node:process";
export default {
    plugins: [function slowPlugin() {
        return async function transformer() {
            process.on("SIGTERM", () => {});
            writeFileSync("worker.pid", String(process.pid));
            await new Promise((resolve) => setTimeout(resolve, 120000));
        };
    }],
};
`
    );
    const port = await getPort({ host: "127.0.0.1" });
    const base = `http://127.0.0.1:${port}`;
    const running = startCli(directory, [
        "--config",
        ".remarkrc.mjs",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--no-open",
    ]);
    let workerPid: number | undefined;
    function workerExists() {
        if (workerPid === undefined) return false;
        try {
            process.kill(workerPid, 0);
            return true;
        } catch (error) {
            if (
                error instanceof Error &&
                "code" in error &&
                error.code === "ESRCH"
            )
                return false;
            throw error;
        }
    }
    try {
        await expect
            .poll(
                async () => {
                    if (running.child.exitCode !== null)
                        throw new Error(running.output());
                    try {
                        return (
                            await request.get(`${base}/api/stats/status`)
                        ).status();
                    } catch {
                        return 0;
                    }
                },
                { timeout: 20_000 }
            )
            .toBe(200);
        await page.goto(`${base}/stats`);
        await page
            .getByRole("button", { name: "Run analysis", exact: true })
            .click();
        await expect
            .poll(async () => {
                try {
                    workerPid = Number(
                        await readFile(join(directory, "worker.pid"), "utf8")
                    );
                    return Number.isInteger(workerPid) && workerPid > 0;
                } catch {
                    return false;
                }
            })
            .toBe(true);
        expect(workerExists()).toBe(true);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(
            page.getByRole("status").filter({ hasText: "Analysis cancelled" })
        ).toBeVisible();
        await expect.poll(workerExists).toBe(false);
        const response = await request.get(`${base}/api/stats/status`);
        expect(await response.json()).toMatchObject({ status: "cancelled" });
        expect(await readFile(join(directory, "readme.md"), "utf8")).toBe(
            markdown
        );
    } finally {
        if (workerExists() && workerPid !== undefined)
            process.kill(workerPid, "SIGKILL");
        await stopChild(running.child);
        await removeWorkspace(directory);
    }
});

for (const entry of ["cli.mjs", "cli.cjs"] as const) {
    test(`${entry}: build --stats produces a browsable snapshot under a non-root base without runtime requests`, async ({
        page,
    }) => {
        const directory = await createWorkspace();
        const outDir = join(directory, "site");
        const build = startCli(
            directory,
            [
                "build",
                "--stats",
                "--config",
                ".remarkrc.mjs",
                "--base",
                "/inspector/",
                "--outDir",
                outDir,
            ],
            entry
        );
        const runtimeRequests: string[] = [];
        const browserErrors: string[] = [];
        page.on("request", (request) => {
            if (new URL(request.url()).pathname.includes("/api/stats/"))
                runtimeRequests.push(request.url());
        });
        page.on("pageerror", (error) => browserErrors.push(error.message));
        // Serve the generated files at exactly the deployment prefix, with SPA fallback.
        const server = createServer(async (request, response) => {
            const pathname = new URL(request.url ?? "/", "http://localhost")
                .pathname;
            if (!pathname.startsWith("/inspector/")) {
                response.writeHead(404).end();
                return;
            }
            const requestPath = pathname.slice("/inspector/".length);
            const relativePath = extname(requestPath)
                ? requestPath
                : "index.html";
            const target = resolve(outDir, relativePath);
            if (!target.startsWith(`${resolve(outDir)}${sep}`)) {
                response.writeHead(404).end();
                return;
            }
            try {
                const body = await readFile(target);
                response.setHeader(
                    "Content-Type",
                    lookup(target) ?? "application/octet-stream"
                );
                response.end(body);
            } catch {
                response.writeHead(404).end();
            }
        });
        try {
            const [code] = await build.exited;
            expect(code, build.output()).toBe(0);
            const payload = JSON.parse(
                await readFile(join(outDir, "api/payload.json"), "utf8")
            ) as { stats: StatsJob["report"] };
            expect(payload.stats?.files.map((file) => file.filePath)).toEqual([
                "readme.md",
            ]);
            expect(payload.stats?.warningCount).toBe(1);
            server.listen(0, "127.0.0.1");
            await once(server, "listening");
            const address = server.address();
            if (!address || typeof address === "string")
                throw new Error("Missing static test server address");
            await page.goto(`http://127.0.0.1:${address.port}/inspector/stats`);
            await expect(
                page.getByText("Saved snapshot", { exact: true })
            ).toBeVisible();
            await page
                .getByRole("button", { name: "Slow Files", exact: true })
                .click();
            await expect(page.getByRole("table")).toContainText("readme.md");
            await expect(
                page.getByRole("button", {
                    name: /Run analysis|Re-run analysis/,
                })
            ).toHaveCount(0);
            await page.getByTestId("nav-link-configs").click();
            await page.getByTestId("nav-link-stats").click();
            await expect(
                page.getByText("Saved snapshot", { exact: true })
            ).toBeVisible();
            expect(runtimeRequests).toEqual([]);
            expect(browserErrors).toEqual([]);
            expect(await readFile(join(directory, "readme.md"), "utf8")).toBe(
                markdown
            );
        } finally {
            await stopChild(build.child);
            if (server.listening) {
                const closed = once(server, "close");
                server.close();
                server.closeAllConnections();
                await closed;
            }
            await removeWorkspace(directory);
        }
    });
}
