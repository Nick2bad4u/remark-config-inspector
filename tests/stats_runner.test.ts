import type { SpawnOptions } from "node:child_process";
import type { StatsReport } from "../shared/stats";
import { ChildProcess } from "node:child_process";
import process from "node:process";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runStats } from "../src/stats/runner";

const mocks = vi.hoisted(() => ({
    spawn: vi.fn<
        (
            executable: string,
            args: string[],
            options: SpawnOptions
        ) => ChildProcess
    >(),
}));
vi.mock("node:child_process", async (original) => ({
    ...(await original<typeof import("node:child_process")>()),
    spawn: mocks.spawn,
}));
vi.mock("node:fs", async (original) => ({
    ...(await original<typeof import("node:fs")>()),
    existsSync: () => true,
}));

let child: ChildProcess;
let stderr: PassThrough;
const report: StatsReport = {
    version: 1,
    createdAt: 1,
    wallTimeMs: 0,
    durationMs: 0,
    phases: { initialization: 0, parse: 0, transform: 0, stringify: 0 },
    files: [],
    errorCount: 0,
    warningCount: 0,
    partial: false,
    diagnostics: [],
};

beforeEach(() => {
    child = new ChildProcess();
    stderr = new PassThrough();
    child.stderr = stderr;
    child.kill = vi.fn(() => true);
    mocks.spawn.mockReset().mockReturnValue(child);
});

afterEach(() => {
    stderr.destroy();
    vi.unstubAllEnvs();
});

describe("profiling subprocess", () => {
    it("isolates automatic debugger attachment while preserving project environment and preload flags", async () => {
        const nodeOptions =
            '--require "./hooks/custom preload.cjs" --conditions=project';
        vi.stubEnv("NODE_OPTIONS", nodeOptions);
        vi.stubEnv("VSCODE_INSPECTOR_OPTIONS", '{"autoAttachMode":"always"}');
        vi.stubEnv("REMARK_TEST_PROJECT_SETTING", "preserved");

        const pending = runStats({ cwd: process.cwd() });
        expect(mocks.spawn).toHaveBeenCalledWith(
            process.execPath,
            expect.any(Array),
            expect.objectContaining({
                env: expect.objectContaining({
                    NODE_OPTIONS: nodeOptions,
                    REMARK_TEST_PROJECT_SETTING: "preserved",
                }),
            })
        );
        expect(mocks.spawn.mock.calls[0]?.[2].env).not.toHaveProperty(
            "VSCODE_INSPECTOR_OPTIONS"
        );
        expect(process.env.VSCODE_INSPECTOR_OPTIONS).toBe(
            '{"autoAttachMode":"always"}'
        );
        child.emit("message", { type: "result", report });
        child.emit("close", 0, null);
        await expect(pending).resolves.toEqual(report);
    });

    it("explains the known V8 fatal error with actionable runtime guidance", async () => {
        const pending = runStats({ cwd: process.cwd() });
        const rejected = expect(pending).rejects.toThrow(
            /crashed inside V8.*Node\.js 24 LTS.*NODE_OPTIONS/
        );
        stderr.write("# Check failed: new_capacity > 0.\n# Native stack trace");
        child.emit("close", 2147483651, null);
        await rejected;
    });

    it("retains diagnostics for other unexpected worker exits", async () => {
        const pending = runStats({ cwd: process.cwd() });
        const rejected = expect(pending).rejects.toThrow(
            "Stats worker exited before returning a report (7).\nFixture startup error"
        );
        stderr.write("Fixture startup error");
        child.emit("close", 7, null);
        await rejected;
    });
});
