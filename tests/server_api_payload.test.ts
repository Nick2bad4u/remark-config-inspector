import process from "node:process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createWsServerMock = vi.fn();

vi.mock("~~/src/ws", () => ({
    createWsServer: createWsServerMock,
}));

beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    createWsServerMock.mockReset();
    createWsServerMock.mockResolvedValue({
        getData: vi.fn().mockResolvedValue({ ok: true }),
    });

    vi.stubGlobal("lazyEventHandler", (factory: () => unknown) => factory());
    vi.stubGlobal("defineEventHandler", (handler: () => unknown) => handler);

    vi.unstubAllEnvs();
});

describe("server/api/payload.json", () => {
    it("uses REMARK_* env vars for ws server options", async () => {
        vi.stubEnv("REMARK_CONFIG", ".remarkrc.mjs");
        vi.stubEnv("REMARK_BASE_PATH", "docs");
        vi.stubEnv("REMARK_TARGET", "docs/guide.md");

        const module = await import("../server/api/payload.json");
        const handler = (await module.default) as () => unknown;
        await handler();

        expect(createWsServerMock).toHaveBeenCalledOnce();
        expect(createWsServerMock).toHaveBeenCalledWith({
            cwd: process.cwd(),
            chdir: false,
            userConfigPath: ".remarkrc.mjs",
            userBasePath: "docs",
            targetFilePath: "docs/guide.md",
        });
    });

    it("ignores legacy ESLINT_* vars in dev API route", async () => {
        vi.stubEnv("ESLINT_CONFIG", "eslint.config.js");
        vi.stubEnv("ESLINT_BASE_PATH", "legacy-root");
        vi.stubEnv("ESLINT_TARGET", "legacy/target.md");

        const module = await import("../server/api/payload.json");
        const handler = (await module.default) as () => unknown;
        await handler();

        expect(createWsServerMock).toHaveBeenCalledOnce();
        expect(createWsServerMock).toHaveBeenCalledWith({
            cwd: process.cwd(),
            chdir: false,
        });
    });
});
