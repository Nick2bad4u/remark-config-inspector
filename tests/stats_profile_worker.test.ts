import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    once: vi.fn<(event: string, callback: (value?: unknown) => void) => void>(),
    exit: vi.fn<(code: number) => never>(),
    send: vi.fn<(message: object, callback?: () => void) => void>(),
    profile: vi.fn(() => new Promise(() => {})),
}));

vi.mock("node:process", () => ({
    default: { once: mocks.once, exit: mocks.exit, send: mocks.send },
}));
vi.mock("../src/stats/profile", () => ({ profileWorkspace: mocks.profile }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
});

it("exits an active profiling worker when its parent IPC channel disconnects", async () => {
    await import("../src/stats/worker");
    const message = mocks.once.mock.calls.find(
        ([event]) => event === "message"
    )?.[1];
    const disconnect = mocks.once.mock.calls.find(
        ([event]) => event === "disconnect"
    )?.[1];
    expect(message).toBeTypeOf("function");
    expect(disconnect).toBeTypeOf("function");
    message?.({ type: "start", options: { cwd: "/workspace" } });
    expect(mocks.profile).toHaveBeenCalledOnce();
    expect(mocks.exit).not.toHaveBeenCalled();
    disconnect?.();
    expect(mocks.exit).toHaveBeenCalledExactlyOnceWith(1);
});
