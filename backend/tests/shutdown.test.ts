import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGracefulShutdown } from "../src/runtime/shutdown.js";
import { createDeferred } from "./helpers/fakes.js";
import { createTestHarness, type TestHarness } from "./helpers/harness.js";

const harnesses: TestHarness[] = [];

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

describe("graceful shutdown", () => {
  it("closes Fastify, heartbeat resources, and SQLite exactly once", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    harness.heartbeatScheduler.every(1_000, () => undefined);
    const close = vi.spyOn(harness.app, "close");
    const forceExit = vi.fn();
    const shutdown = createGracefulShutdown(harness.app, { forceExit });

    await Promise.all([shutdown("SIGINT"), shutdown("SIGTERM")]);

    expect(close).toHaveBeenCalledTimes(1);
    expect(harness.database.open).toBe(false);
    expect(harness.heartbeatScheduler).toMatchObject({ activeCount: 0 });
    expect(forceExit).not.toHaveBeenCalled();
  });

  it("uses the bounded force-exit path when close does not settle", async () => {
    vi.useFakeTimers();
    const closeGate = createDeferred<void>();
    const forceExit = vi.fn();
    const app = {
      close: vi.fn(() => closeGate.promise),
      log: { info: vi.fn(), error: vi.fn() },
    } as unknown as FastifyInstance;
    const shutdown = createGracefulShutdown(app, { timeoutMs: 50, forceExit });

    const pending = shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(51);
    expect(forceExit).toHaveBeenCalledWith(1);
    closeGate.resolve();
    await pending;
  });
});

