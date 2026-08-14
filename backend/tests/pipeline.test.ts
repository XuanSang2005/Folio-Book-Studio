import { afterEach, describe, expect, it, vi } from "vitest";
import type { PipelineStepOrdinal } from "@gradion-folio/contracts";
import {
  checkpointPortrait,
  checkpointStepResult,
  claimStep,
  failAttempt,
  heartbeatAttempt,
  succeedAttempt,
} from "../src/pipeline/pipeline-service.js";
import {
  StepExecutionError,
  UnconfiguredStepExecutor,
  type StepExecutionResult,
} from "../src/pipeline/step-executor.js";
import { createPasteProject, signIn } from "./helpers/api.js";
import {
  FakeAttemptIdGenerator,
  FakeClock,
  FakeHeartbeatScheduler,
  FakeStepExecutor,
  createDeferred,
} from "./helpers/fakes.js";
import { createTestHarness, type TestHarness } from "./helpers/harness.js";

const harnesses: TestHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.cleanup()));
});

async function runStep(
  harness: TestHarness,
  cookie: string,
  projectId: string,
  ordinal: PipelineStepOrdinal,
  payload: Record<string, unknown> = {},
) {
  return harness.app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/steps/${ordinal}/run`,
    headers: { cookie },
    payload,
  });
}

async function recoverStep(
  harness: TestHarness,
  cookie: string,
  projectId: string,
  ordinal: PipelineStepOrdinal,
) {
  return harness.app.inject({
    method: "POST",
    url: `/api/projects/${projectId}/steps/${ordinal}/recover`,
    headers: { cookie },
  });
}

function completeStepsBeforePortraits(harness: TestHarness, projectId: string): void {
  const now = harness.clock.now().getTime();
  harness.database.prepare(`
    UPDATE pipeline_steps
    SET status = 'succeeded', attempt_count = 1, completed_at = ?, updated_at = ?
    WHERE project_id = ? AND ordinal IN (1, 2)
  `).run(now, now, projectId);
}

function insertCharacters(
  harness: TestHarness,
  projectId: string,
  statuses: ["pending" | "running" | "succeeded" | "failed", "pending" | "running" | "succeeded" | "failed"] = ["pending", "pending"],
): void {
  const now = harness.clock.now().getTime();
  const insert = harness.database.prepare(`
    INSERT INTO characters (
      id, project_id, position, name, role, age_group, prompt,
      portrait_status, portrait_path, portrait_mime, portrait_bytes,
      portrait_sha256, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'Lead', 'adult', 'Portrait prompt', ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    "character-mole",
    projectId,
    0,
    "Mole",
    statuses[0],
    statuses[0] === "succeeded" ? "fake/portrait-mole.png" : null,
    statuses[0] === "succeeded" ? "image/png" : null,
    statuses[0] === "succeeded" ? 68 : null,
    statuses[0] === "succeeded" ? "a".repeat(64) : null,
    now,
    now,
  );
  insert.run(
    "character-rat",
    projectId,
    1,
    "Water Rat",
    statuses[1],
    statuses[1] === "succeeded" ? "fake/portrait-rat.png" : null,
    statuses[1] === "succeeded" ? "image/png" : null,
    statuses[1] === "succeeded" ? 68 : null,
    statuses[1] === "succeeded" ? "b".repeat(64) : null,
    now,
    now,
  );
}

describe("durable pipeline claims, fencing, and recovery", () => {
  it("allows one claimant across two app instances and returns 202 to the live duplicate", async () => {
    const gate = createDeferred<StepExecutionResult>();
    const clock = new FakeClock();
    const attemptIds = new FakeAttemptIdGenerator();
    const firstExecutor = new FakeStepExecutor([() => gate.promise]);
    const secondExecutor = new FakeStepExecutor();
    const first = await createTestHarness({ clock, attemptIds, stepExecutor: firstExecutor });
    let second: TestHarness | undefined;

    try {
      const session = await signIn(first);
      const project = await createPasteProject(first, session.cookie);
      const projectId = project.json().id as string;
      second = await createTestHarness({
        temporaryDirectory: first.temporaryDirectory,
        clock,
        attemptIds,
        stepExecutor: secondExecutor,
      });

      const firstRequest = runStep(first, session.cookie, projectId, 1);
      await vi.waitFor(() => expect(firstExecutor.calls).toHaveLength(1));
      const duplicate = await runStep(second, session.cookie, projectId, 1);

      expect(duplicate.statusCode).toBe(202);
      const duplicateBody = duplicate.json();
      expect(duplicateBody.disposition).toBe("running");
      expect(duplicateBody.project.steps[0]).toMatchObject({
        ordinal: 1,
        visibleState: "running",
      });
      expect(secondExecutor.calls).toHaveLength(0);
      expect(first.database.prepare("SELECT COUNT(*) AS count FROM step_attempts").get())
        .toEqual({ count: 1 });

      gate.resolve({ result: { completed: true } });
      const completed = await firstRequest;
      expect(completed.statusCode).toBe(200);
      expect(completed.json().disposition).toBe("succeeded");
      expect(firstExecutor.calls).toHaveLength(1);
    } finally {
      if (second) await second.cleanup();
      await first.cleanup();
    }
  });

  it("enforces order, succeeded idempotency, failure persistence, and explicit retry", async () => {
    const executor = new FakeStepExecutor([
      () => ({ result: { style: "done" } }),
      () => { throw new StepExecutionError("PROVIDER_UNAVAILABLE", "Provider unavailable."); },
      () => ({ result: { characters: "done" } }),
    ]);
    const harness = await createTestHarness({ stepExecutor: executor });
    harnesses.push(harness);
    const session = await signIn(harness);
    const project = await createPasteProject(harness, session.cookie);
    const projectId = project.json().id as string;

    const outOfOrder = await runStep(harness, session.cookie, projectId, 2);
    expect(outOfOrder.statusCode).toBe(409);
    expect(outOfOrder.json().error.code).toBe("STEP_OUT_OF_ORDER");
    expect(executor.calls).toHaveLength(0);

    expect((await runStep(harness, session.cookie, projectId, 1)).statusCode).toBe(200);
    const idempotent = await runStep(harness, session.cookie, projectId, 1);
    expect(idempotent.statusCode).toBe(200);
    expect(idempotent.json().disposition).toBe("already_succeeded");
    expect(executor.calls).toHaveLength(1);

    const failed = await runStep(harness, session.cookie, projectId, 2);
    expect(failed.statusCode).toBe(503);
    expect(failed.json().error).toEqual({
      code: "PROVIDER_UNAVAILABLE",
      message: "Provider unavailable.",
    });
    expect(executor.calls).toHaveLength(2);
    expect(harness.database.prepare(`
      SELECT ordinal, status FROM pipeline_steps WHERE project_id = ? AND ordinal IN (1, 2)
      ORDER BY ordinal
    `).all(projectId)).toEqual([
      { ordinal: 1, status: "succeeded" },
      { ordinal: 2, status: "failed" },
    ]);
    expect(harness.database.prepare(`
      SELECT attempt_no, status FROM step_attempts
      WHERE project_id = ? AND step_ordinal = 2 ORDER BY attempt_no
    `).all(projectId)).toEqual([{ attempt_no: 1, status: "failed" }]);

    const retried = await runStep(harness, session.cookie, projectId, 2);
    expect(retried.statusCode).toBe(200);
    expect(executor.calls.map(({ ordinal, attemptNumber }) => ({ ordinal, attemptNumber })))
      .toEqual([
        { ordinal: 1, attemptNumber: 1 },
        { ordinal: 2, attemptNumber: 1 },
        { ordinal: 2, attemptNumber: 2 },
      ]);
    expect(harness.database.prepare(`
      SELECT attempt_no, status FROM step_attempts
      WHERE project_id = ? AND step_ordinal = 2 ORDER BY attempt_no
    `).all(projectId)).toEqual([
      { attempt_no: 1, status: "failed" },
      { attempt_no: 2, status: "succeeded" },
    ]);
    expect(harness.gemini.operations).toHaveLength(0);
  });

  it("fails safely without Gemini configuration and performs no Gemini operation", async () => {
    const harness = await createTestHarness({
      stepExecutor: new UnconfiguredStepExecutor(),
    });
    harnesses.push(harness);
    const session = await signIn(harness);
    const project = await createPasteProject(harness, session.cookie);
    const projectId = project.json().id as string;

    const response = await runStep(harness, session.cookie, projectId, 1);

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "GEMINI_NOT_CONFIGURED",
        message: "Pipeline execution is not configured for this runtime.",
      },
    });
    expect(harness.gemini.operations).toHaveLength(0);
    expect(harness.database.prepare(`
      SELECT attempt_no, status, error_code FROM step_attempts
      WHERE project_id = ? AND step_ordinal = 1
    `).all(projectId)).toEqual([{
      attempt_no: 1,
      status: "failed",
      error_code: "GEMINI_NOT_CONFIGURED",
    }]);
  });

  it("extends only the active lease and requires explicit recovery before retry", async () => {
    const gate = createDeferred<StepExecutionResult>();
    const scheduler = new FakeHeartbeatScheduler();
    const executor = new FakeStepExecutor([
      () => gate.promise,
      () => ({ result: { retry: true } }),
    ]);
    const harness = await createTestHarness({
      heartbeatScheduler: scheduler,
      stepExecutor: executor,
    });
    harnesses.push(harness);
    const session = await signIn(harness);
    const project = await createPasteProject(harness, session.cookie);
    const projectId = project.json().id as string;

    const oldRequest = runStep(harness, session.cookie, projectId, 1);
    await vi.waitFor(() => expect(executor.calls).toHaveLength(1));
    const initial = harness.database.prepare(`
      SELECT active_attempt_id, heartbeat_at, lease_expires_at FROM pipeline_steps
      WHERE project_id = ? AND ordinal = 1
    `).get(projectId) as {
      active_attempt_id: string;
      heartbeat_at: number;
      lease_expires_at: number;
    };

    harness.clock.advance(harness.config.HEARTBEAT_MS);
    scheduler.tick();
    const extended = harness.database.prepare(`
      SELECT heartbeat_at, lease_expires_at FROM pipeline_steps
      WHERE project_id = ? AND ordinal = 1
    `).get(projectId) as { heartbeat_at: number; lease_expires_at: number };
    expect(extended.heartbeat_at).toBeGreaterThan(initial.heartbeat_at);
    expect(extended.lease_expires_at).toBeGreaterThan(initial.lease_expires_at);
    expect(heartbeatAttempt(harness.dependencies, projectId, 1, "stale-attempt")).toBe(false);

    const earlyRecovery = await recoverStep(harness, session.cookie, projectId, 1);
    expect(earlyRecovery.statusCode).toBe(409);
    expect(earlyRecovery.json().error.code).toBe("STEP_ALREADY_RUNNING");

    harness.clock.advance(harness.config.STEP_LEASE_MS + 1);
    const detail = await harness.app.inject({
      method: "GET",
      url: `/api/projects/${projectId}`,
      headers: { cookie: session.cookie },
    });
    expect(detail.json().steps[0]).toMatchObject({ status: "running", visibleState: "stuck" });
    const blockedRetry = await runStep(harness, session.cookie, projectId, 1);
    expect(blockedRetry.statusCode).toBe(409);
    expect(blockedRetry.json().error.code).toBe("STEP_STUCK");

    const recovered = await recoverStep(harness, session.cookie, projectId, 1);
    expect(recovered.statusCode).toBe(200);
    const recoveredBody = recovered.json();
    expect(recoveredBody.disposition).toBe("recovered");
    expect(recoveredBody.project.steps[0]).toMatchObject({
      status: "failed",
      errorCode: "PROCESS_INTERRUPTED",
    });
    expect(executor.calls).toHaveLength(1);
    expect(harness.gemini.operations).toHaveLength(0);

    const retried = await runStep(harness, session.cookie, projectId, 1);
    expect(retried.statusCode).toBe(200);
    gate.resolve({ result: { tooLate: true } });
    const stale = await oldRequest;
    expect(stale.statusCode).toBe(200);
    expect(stale.json().disposition).toBe("stale");
    expect(harness.database.prepare(`
      SELECT attempt_no, status FROM step_attempts
      WHERE project_id = ? AND step_ordinal = 1 ORDER BY attempt_no
    `).all(projectId)).toEqual([
      { attempt_no: 1, status: "abandoned" },
      { attempt_no: 2, status: "succeeded" },
    ]);
    expect(scheduler.activeCount).toBe(0);
  });

  it("rejects success, failure, heartbeat, result, and portrait writes from a stale fence", async () => {
    const harness = await createTestHarness();
    harnesses.push(harness);
    const session = await signIn(harness);
    const userId = session.response.json().user.id as string;
    const project = await createPasteProject(harness, session.cookie);
    const projectId = project.json().id as string;
    completeStepsBeforePortraits(harness, projectId);
    insertCharacters(harness, projectId);

    const claim = claimStep(harness.dependencies, userId, projectId, 3);
    expect(claim.kind).toBe("claimed");
    if (claim.kind !== "claimed") throw new Error("Expected a claimed portrait attempt");

    expect(heartbeatAttempt(harness.dependencies, projectId, 3, "stale-fence")).toBe(false);
    expect(checkpointStepResult(
      harness.dependencies,
      projectId,
      3,
      "stale-fence",
      { stale: true },
    )).toBe(false);
    expect(checkpointPortrait(harness.dependencies, projectId, "stale-fence", {
      characterId: "character-mole",
      status: "succeeded",
      portraitPath: "fake/stale.png",
    })).toBe(false);
    expect(succeedAttempt(harness.dependencies, projectId, 3, "stale-fence")).toBe(false);
    expect(failAttempt(harness.dependencies, projectId, 3, "stale-fence", {
      code: "PROVIDER_UNAVAILABLE",
      message: "Stale failure.",
    })).toBe(false);

    expect(checkpointPortrait(harness.dependencies, projectId, claim.attemptId, {
      characterId: "character-mole",
      status: "succeeded",
      portraitPath: "fake/current.png",
    })).toBe(true);
    expect(checkpointPortrait(harness.dependencies, projectId, claim.attemptId, {
      characterId: "character-rat",
      status: "succeeded",
      portraitPath: "fake/current-rat.png",
    })).toBe(true);
    expect(succeedAttempt(harness.dependencies, projectId, 3, claim.attemptId)).toBe(true);
    expect(harness.database.prepare(`
      SELECT status, result_json FROM pipeline_steps WHERE project_id = ? AND ordinal = 3
    `).get(projectId)).toEqual({ status: "succeeded", result_json: null });
  });

  it("restores durable running/current state after app and database restart", async () => {
    const clock = new FakeClock();
    const attemptIds = new FakeAttemptIdGenerator();
    const first = await createTestHarness({ clock, attemptIds });
    let second: TestHarness | undefined;

    try {
      const session = await signIn(first);
      const userId = session.response.json().user.id as string;
      const project = await createPasteProject(first, session.cookie);
      const projectId = project.json().id as string;
      const claim = claimStep(first.dependencies, userId, projectId, 1);
      expect(claim.kind).toBe("claimed");
      await first.app.close();

      second = await createTestHarness({
        temporaryDirectory: first.temporaryDirectory,
        clock,
        attemptIds,
      });
      const running = await second.app.inject({
        method: "GET",
        url: `/api/projects/${projectId}`,
        headers: { cookie: session.cookie },
      });
      expect(running.statusCode).toBe(200);
      expect(running.json().steps[0]).toMatchObject({
        status: "running",
        visibleState: "running",
        attemptCount: 1,
      });

      clock.advance(second.config.STEP_LEASE_MS + 1);
      const stuck = await second.app.inject({
        method: "GET",
        url: `/api/projects/${projectId}`,
        headers: { cookie: session.cookie },
      });
      expect(stuck.json().steps[0]).toMatchObject({ status: "running", visibleState: "stuck" });
      expect(second.stepExecutor).toBeDefined();
    } finally {
      if (second) await second.cleanup();
      await first.cleanup();
    }
  });

  it("preserves portrait 1 across portrait 2 failure and retries only portrait 2", async () => {
    const executor = new FakeStepExecutor([
      (context) => {
        expect(context.portraits.map(({ characterId }) => characterId))
          .toEqual(["character-mole", "character-rat"]);
        expect(context.checkpointPortrait({
          characterId: "character-mole",
          status: "succeeded",
          portraitPath: "fake/portrait-mole.png",
          portraitMime: "image/png",
          portraitBytes: 68,
          portraitSha256: "a".repeat(64),
        })).toBe(true);
        expect(context.checkpointPortrait({
          characterId: "character-rat",
          status: "failed",
          errorCode: "PROVIDER_UNAVAILABLE",
          errorMessage: "Portrait two failed.",
        })).toBe(true);
        throw new StepExecutionError("PROVIDER_UNAVAILABLE", "Portrait two failed.");
      },
      (context) => {
        expect(context.portraits.map(({ characterId }) => characterId))
          .toEqual(["character-rat"]);
        expect(context.checkpointPortrait({
          characterId: "character-rat",
          status: "succeeded",
          portraitPath: "fake/portrait-rat.png",
          portraitMime: "image/png",
          portraitBytes: 68,
          portraitSha256: "b".repeat(64),
        })).toBe(true);
        return {};
      },
    ]);
    const harness = await createTestHarness({ stepExecutor: executor });
    harnesses.push(harness);
    const session = await signIn(harness);
    const project = await createPasteProject(harness, session.cookie);
    const projectId = project.json().id as string;
    completeStepsBeforePortraits(harness, projectId);
    insertCharacters(harness, projectId);

    const failed = await runStep(harness, session.cookie, projectId, 3);
    expect(failed.statusCode).toBe(503);
    expect(harness.database.prepare(`
      SELECT id, portrait_status, portrait_path FROM characters
      WHERE project_id = ? ORDER BY position
    `).all(projectId)).toEqual([
      { id: "character-mole", portrait_status: "succeeded", portrait_path: "fake/portrait-mole.png" },
      { id: "character-rat", portrait_status: "failed", portrait_path: null },
    ]);

    const retried = await runStep(harness, session.cookie, projectId, 3);
    expect(retried.statusCode).toBe(200);
    expect(harness.database.prepare(`
      SELECT id, portrait_status, portrait_path FROM characters
      WHERE project_id = ? ORDER BY position
    `).all(projectId)).toEqual([
      { id: "character-mole", portrait_status: "succeeded", portrait_path: "fake/portrait-mole.png" },
      { id: "character-rat", portrait_status: "succeeded", portrait_path: "fake/portrait-rat.png" },
    ]);
    expect(executor.calls).toHaveLength(2);
    expect(harness.gemini.operations).toHaveLength(0);
  });

  it("recovers only running portrait items and rejects a late abandoned checkpoint", async () => {
    const gate = createDeferred<void>();
    let lateCheckpointAccepted: boolean | undefined;
    const executor = new FakeStepExecutor([
      async (context) => {
        context.checkpointPortrait({
          characterId: "character-mole",
          status: "succeeded",
          portraitPath: "fake/portrait-mole.png",
        });
        context.checkpointPortrait({ characterId: "character-rat", status: "running" });
        await gate.promise;
        lateCheckpointAccepted = context.checkpointPortrait({
          characterId: "character-rat",
          status: "succeeded",
          portraitPath: "fake/late-rat.png",
        });
        return {};
      },
      (context) => {
        expect(context.portraits.map(({ characterId }) => characterId))
          .toEqual(["character-rat"]);
        context.checkpointPortrait({
          characterId: "character-rat",
          status: "succeeded",
          portraitPath: "fake/retry-rat.png",
        });
        return {};
      },
    ]);
    const harness = await createTestHarness({ stepExecutor: executor });
    harnesses.push(harness);
    const session = await signIn(harness);
    const project = await createPasteProject(harness, session.cookie);
    const projectId = project.json().id as string;
    completeStepsBeforePortraits(harness, projectId);
    insertCharacters(harness, projectId);

    const oldRequest = runStep(harness, session.cookie, projectId, 3);
    await vi.waitFor(() => expect(executor.calls).toHaveLength(1));
    harness.clock.advance(harness.config.STEP_LEASE_MS + 1);
    expect((await recoverStep(harness, session.cookie, projectId, 3)).statusCode).toBe(200);
    expect(harness.database.prepare(`
      SELECT id, portrait_status, portrait_path FROM characters
      WHERE project_id = ? ORDER BY position
    `).all(projectId)).toEqual([
      { id: "character-mole", portrait_status: "succeeded", portrait_path: "fake/portrait-mole.png" },
      { id: "character-rat", portrait_status: "pending", portrait_path: null },
    ]);

    expect((await runStep(harness, session.cookie, projectId, 3)).statusCode).toBe(200);
    gate.resolve(undefined);
    expect((await oldRequest).json().disposition).toBe("stale");
    expect(lateCheckpointAccepted).toBe(false);
    expect(harness.database.prepare(`
      SELECT portrait_status, portrait_path FROM characters WHERE id = 'character-rat'
    `).get()).toEqual({
      portrait_status: "succeeded",
      portrait_path: "fake/retry-rat.png",
    });
  });

  it("reconciles fully checkpointed portraits without invoking the executor", async () => {
    const executor = new FakeStepExecutor();
    const harness = await createTestHarness({ stepExecutor: executor });
    harnesses.push(harness);
    const session = await signIn(harness);
    const project = await createPasteProject(harness, session.cookie);
    const projectId = project.json().id as string;
    completeStepsBeforePortraits(harness, projectId);
    insertCharacters(harness, projectId, ["succeeded", "succeeded"]);
    const now = harness.clock.now().getTime();
    harness.database.prepare(`
      UPDATE pipeline_steps
      SET status = 'failed', attempt_count = 1,
          error_code = 'PROCESS_INTERRUPTED', error_message = 'Interrupted', updated_at = ?
      WHERE project_id = ? AND ordinal = 3
    `).run(now, projectId);
    harness.database.prepare(`
      INSERT INTO step_attempts (
        id, project_id, step_ordinal, attempt_no, status, started_at, finished_at,
        error_code, error_message
      ) VALUES ('old-attempt', ?, 3, 1, 'abandoned', ?, ?, 'PROCESS_INTERRUPTED', 'Interrupted')
    `).run(projectId, now, now);

    const reconciled = await runStep(harness, session.cookie, projectId, 3);
    expect(reconciled.statusCode).toBe(200);
    expect(reconciled.json().project.steps[2]).toMatchObject({
      status: "succeeded",
      visibleState: "succeeded",
      attemptCount: 2,
    });
    expect(executor.calls).toHaveLength(0);
    expect(harness.database.prepare(`
      SELECT attempt_no, status FROM step_attempts
      WHERE project_id = ? AND step_ordinal = 3 ORDER BY attempt_no
    `).all(projectId)).toEqual([
      { attempt_no: 1, status: "abandoned" },
      { attempt_no: 2, status: "succeeded" },
    ]);
  });

  it("returns identical generic 404s for foreign and missing run/recover targets", async () => {
    const executor = new FakeStepExecutor();
    const harness = await createTestHarness({ stepExecutor: executor });
    harnesses.push(harness);
    const owner = await signIn(harness, { name: "Owner", email: "owner@example.com" });
    const project = await createPasteProject(harness, owner.cookie);
    const projectId = project.json().id as string;
    const stranger = await signIn(harness, { name: "Stranger", email: "stranger@example.com" });
    const missingId = "00000000-0000-4000-8000-999999999999";

    const foreignRun = await runStep(harness, stranger.cookie, projectId, 1);
    const missingRun = await runStep(harness, stranger.cookie, missingId, 1);
    const foreignRecover = await recoverStep(harness, stranger.cookie, projectId, 1);
    const missingRecover = await recoverStep(harness, stranger.cookie, missingId, 1);

    expect([foreignRun, missingRun, foreignRecover, missingRecover].map(({ statusCode }) => statusCode))
      .toEqual([404, 404, 404, 404]);
    expect(foreignRun.json()).toEqual(missingRun.json());
    expect(foreignRecover.json()).toEqual(missingRecover.json());
    expect(executor.calls).toHaveLength(0);
    expect(harness.gemini.operations).toHaveLength(0);
  });
});
