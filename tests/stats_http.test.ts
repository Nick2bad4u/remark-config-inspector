import type { StatsJob } from "../shared/stats";
import type { StatsAction } from "../src/stats/http";
import { describe, expect, it, vi } from "vitest";
import { handleStatsAction } from "../src/stats/http";

function serviceFixture() {
    const job: StatsJob = {
        status: "idle",
        progress: { completedFiles: 0, discoveredFiles: 0 },
    };
    return {
        job,
        service: {
            getStatus: vi.fn(() => job),
            run: vi.fn(() => job),
            cancel: vi.fn(() => job),
            invalidate: vi.fn(),
            close: vi.fn(),
        },
    };
}

describe("stats HTTP method and origin contract", () => {
    it.each([
        [
            "status",
            "GET",
            "getStatus",
        ],
        [
            "run",
            "POST",
            "run",
        ],
        [
            "cancel",
            "POST",
            "cancel",
        ],
    ] as const)("dispatches %s using %s", (action, method, handler) => {
        const { job, service } = serviceFixture();
        expect(
            handleStatsAction(service, action, {
                method,
                origin: "http://127.0.0.1:9999",
                host: "127.0.0.1:9999",
            })
        ).toBe(job);
        expect(service[handler]).toHaveBeenCalledOnce();
    });

    it.each([
        ["status", "POST"],
        ["run", "GET"],
        ["cancel", "GET"],
        ["run", "OPTIONS"],
    ] satisfies [StatsAction, string][])(
        "rejects %s using %s without invoking a service",
        (action, method) => {
            const { service } = serviceFixture();
            expect(() =>
                handleStatsAction(service, action, { method })
            ).toThrow(expect.objectContaining({ statusCode: 405 }));
            expect(service.run).not.toHaveBeenCalled();
            expect(service.cancel).not.toHaveBeenCalled();
            expect(service.getStatus).not.toHaveBeenCalled();
        }
    );

    it.each([
        "https://untrusted.example",
        "http://127.0.0.1:8888",
        "https://127.0.0.1:9999",
        "null",
        "invalid origin",
    ])("rejects mutating requests from %s", (origin) => {
        const { service } = serviceFixture();
        for (const action of ["run", "cancel"] as const) {
            expect(() =>
                handleStatsAction(service, action, {
                    method: "POST",
                    origin,
                    host: "127.0.0.1:9999",
                })
            ).toThrow(expect.objectContaining({ statusCode: 403 }));
        }
        expect(service.run).not.toHaveBeenCalled();
        expect(service.cancel).not.toHaveBeenCalled();
    });

    it("allows non-browser clients without an Origin header", () => {
        const { service } = serviceFixture();
        handleStatsAction(service, "run", {
            method: "POST",
            host: "127.0.0.1:9999",
        });
        expect(service.run).toHaveBeenCalledOnce();
    });

    it("accepts the matching HTTPS origin when the inspector uses HTTPS", () => {
        const { service } = serviceFixture();
        handleStatsAction(service, "run", {
            method: "POST",
            origin: "https://127.0.0.1:9999",
            host: "127.0.0.1:9999",
            protocol: "https",
        });
        expect(service.run).toHaveBeenCalledOnce();
    });

    it.each([
        ["http", "80"],
        ["https", "443"],
    ])("normalizes an explicit %s default port", (protocol, port) => {
        const { service } = serviceFixture();
        handleStatsAction(service, "run", {
            method: "POST",
            origin: `${protocol}://localhost`,
            host: `localhost:${port}`,
            protocol,
        });
        expect(service.run).toHaveBeenCalledOnce();
    });
});
