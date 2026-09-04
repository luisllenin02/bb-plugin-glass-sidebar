import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin, { type StoredLifecycleRow } from "../server";
import { DEFAULT_SIDEBAR_SETTINGS } from "./sidebar-settings";
import { legacyLifecycleColumns } from "./lifecycle";

interface LifecycleListResult {
  rows: StoredLifecycleRow[];
}

/** The raw table, including Q0's three mirrored columns. */
interface RawLifecycleRow {
  thread_id: string;
  state: string;
  wake_at: number | null;
  updated_at: number;
  settled_at: number | null;
  settled_override: "active" | "settled" | null;
  snoozed_until: number | null;
  snoozed_at: number | null;
}

const disposers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose();
});

function availablePullRequest(
  state: "closed" | "draft" | "merged" | "open",
  updatedAt = new Date().toISOString(),
) {
  return {
    outcome: "available" as const,
    pullRequest: {
      attention: state === "merged" ? ("merged" as const) : ("none" as const),
      baseRefName: "main",
      checks: {
        failedCount: 0,
        passedCount: 1,
        pendingCount: 0,
        state: "passing" as const,
        totalCount: 1,
      },
      headRefName: "feature",
      mergeability: {
        mergeStateStatus: "CLEAN" as const,
        mergeable: "MERGEABLE" as const,
      },
      number: 7,
      state,
      title: "A pull request",
      updatedAt,
      url: "https://example.test/pull/7",
    },
  };
}

async function loadPlugin(
  options: {
    unpin?: (input: { threadId: string }) => Promise<unknown>;
    threads?: (input?: {
      limit?: number;
      offset?: number;
    }) => Promise<unknown[]>;
    pullRequest?: () => Promise<unknown>;
  } = {},
) {
  const { bb, harness } = createFakePluginHost({
    pluginId: "glass-sidebar",
    sdk: {
      threads: {
        list: options.threads ?? (async () => []),
        unpin:
          options.unpin ??
          (async ({ threadId }: { threadId: string }) =>
            makeThreadResponse({ id: threadId })),
      },
      ...(options.pullRequest
        ? { environments: { pullRequest: options.pullRequest } }
        : {}),
    },
  } as Parameters<typeof createFakePluginHost>[0]);
  const db = bb.storage.database();
  await plugin(bb);
  disposers.push(() => harness.lifecycle.dispose());
  return { harness, db };
}

function rawRows(db: { prepare: (sql: string) => { all: () => unknown[] } }) {
  return db
    .prepare(
      `SELECT thread_id, state, wake_at, updated_at, settled_at,
              settled_override, snoozed_until, snoozed_at
         FROM thread_lifecycle ORDER BY thread_id`,
    )
    .all() as RawLifecycleRow[];
}

function lifecycleSignals(harness: {
  inspection: { realtimeSignals: readonly { channel: string }[] };
}) {
  return harness.inspection.realtimeSignals.filter(
    (signal) => signal.channel === "lifecycle",
  );
}

/** Every raw row's three mirrors agree with the pure helper. */
function expectMirrorsConsistent(rows: readonly RawLifecycleRow[]) {
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(row.state).not.toBeNull();
    expect(row.updated_at).toEqual(expect.any(Number));
    expect(legacyLifecycleColumns(
      {
        threadId: row.thread_id,
        settledAt: row.settled_at,
        settledOverride: row.settled_override,
        snoozedUntil: row.snoozed_until,
        snoozedAt: row.snoozed_at,
      },
      row.updated_at,
    )).toEqual({
      state: row.state,
      wakeAt: row.wake_at,
      updatedAt: row.updated_at,
    });
  }
}

describe("lifecycle schema reconciliation", () => {
  // Q0 created `thread_lifecycle` with NOT NULL `state` and `updated_at`, and
  // SQLite cannot relax a NOT NULL constraint with ALTER TABLE. Every mutation
  // must therefore supply the mirrors, on a database built from the plugin's
  // real migration list, from empty.
  it("drives every mutation on Q0's schema without a NOT NULL violation", async () => {
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const { harness, db } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_policy",
          createdAt: old,
          updatedAt: old,
          latestAttentionAt: old,
          status: "idle",
        }),
      ],
    });
    const wakeAt = Date.now() + 60_000;

    await harness.behavior.callRpc("settle", { threadId: "thr_settle" });
    expectMirrorsConsistent(rawRows(db));
    await harness.behavior.callRpc("unsettle", { threadId: "thr_settle" });
    expectMirrorsConsistent(rawRows(db));
    await harness.behavior.callRpc("snooze", {
      threadId: "thr_snooze",
      snoozedUntil: wakeAt,
    });
    expectMirrorsConsistent(rawRows(db));
    await harness.behavior.callRpc("bulkSettle", {
      threadIds: ["thr_bulk_a", "thr_bulk_b"],
    });
    expectMirrorsConsistent(rawRows(db));
    await harness.behavior.callRpc("bulkSnooze", {
      threadIds: ["thr_bulk_a"],
      snoozedUntil: wakeAt,
    });
    expectMirrorsConsistent(rawRows(db));
    await harness.behavior.callRpc("evaluateAutoSettle", {});
    expectMirrorsConsistent(rawRows(db));

    const byId = new Map(rawRows(db).map((row) => [row.thread_id, row]));
    expect(byId.get("thr_settle")).toMatchObject({
      state: "active",
      wake_at: null,
      settled_override: "active",
    });
    expect(byId.get("thr_snooze")).toMatchObject({
      state: "snoozed",
      wake_at: wakeAt,
    });
    expect(byId.get("thr_bulk_b")).toMatchObject({
      state: "settled",
      wake_at: null,
    });
    expect(byId.get("thr_policy")).toMatchObject({ state: "settled" });

    await harness.behavior.callRpc("unsnooze", { threadId: "thr_snooze" });
    await harness.behavior.callRpc("acknowledgeWake", {
      threadId: "thr_bulk_a",
    });
    expect(
      rawRows(db).map((row) => row.thread_id).includes("thr_snooze"),
    ).toBe(false);
    expect(
      harness.inspection.logEntries.filter((entry) =>
        `${entry.message}`.includes("NOT NULL"),
      ),
    ).toEqual([]);
  });
});

describe("lifecycle RPCs", () => {
  it("settles and restores a thread", async () => {
    const { harness } = await loadPlugin();

    await harness.behavior.callRpc("settle", { threadId: "thr_1" });
    expect(harness.inspection.sdk.callsTo("threads.unpin")).toEqual([
      [{ threadId: "thr_1" }],
    ]);
    const settled = (await harness.behavior.callRpc(
      "listLifecycle",
      {},
    )) as LifecycleListResult;
    expect(settled.rows).toEqual([
      expect.objectContaining({
        threadId: "thr_1",
        settledAt: expect.any(Number),
        snoozedUntil: null,
      }),
    ]);

    await harness.behavior.callRpc("unsettle", { threadId: "thr_1" });
    await expect(
      harness.behavior.callRpc("listLifecycle", {}),
    ).resolves.toEqual({
      rows: [
        expect.objectContaining({
          threadId: "thr_1",
          settledAt: null,
          settledOverride: "active",
        }),
      ],
    });
  });

  it("keeps settle and snooze mutually exclusive", async () => {
    const { harness } = await loadPlugin();
    const wakeAt = Date.now() + 60_000;

    await harness.behavior.callRpc("settle", { threadId: "thr_1" });
    await harness.behavior.callRpc("snooze", {
      threadId: "thr_1",
      snoozedUntil: wakeAt,
    });

    const result = (await harness.behavior.callRpc(
      "listLifecycle",
      {},
    )) as LifecycleListResult;
    expect(result.rows).toEqual([
      expect.objectContaining({
        threadId: "thr_1",
        settledAt: null,
        snoozedUntil: wakeAt,
        snoozedAt: expect.any(Number),
      }),
    ]);
  });

  it("bulk settles successful rows and reports unpin failures", async () => {
    const { harness } = await loadPlugin({
      unpin: async ({ threadId }) => {
        if (threadId === "blocked") throw new Error("cannot unpin");
        return makeThreadResponse({ id: threadId });
      },
    });

    await expect(
      harness.behavior.callRpc("bulkSettle", {
        threadIds: ["first", "blocked", "third"],
      }),
    ).resolves.toEqual({
      succeededThreadIds: ["first", "third"],
      failures: [{ threadId: "blocked", error: "cannot unpin" }],
    });
    const lifecycle = (await harness.behavior.callRpc(
      "listLifecycle",
      {},
    )) as LifecycleListResult;
    expect(lifecycle.rows.map((row) => row.threadId).sort()).toEqual([
      "first",
      "third",
    ]);
    expect(harness.inspection.realtimeSignals).toContainEqual({
      channel: "lifecycle",
      payload: { threadIds: ["first", "third"] },
    });
  });

  it("bulk snoozes rows with one lifecycle invalidation", async () => {
    const { harness } = await loadPlugin();
    const snoozedUntil = Date.now() + 60_000;

    await expect(
      harness.behavior.callRpc("bulkSnooze", {
        threadIds: ["first", "second"],
        snoozedUntil,
      }),
    ).resolves.toEqual({
      succeededThreadIds: ["first", "second"],
      failures: [],
    });
    expect(
      harness.inspection.realtimeSignals.filter(
        (signal) => signal.channel === "lifecycle",
      ),
    ).toEqual([
      { channel: "lifecycle", payload: { threadIds: ["first", "second"] } },
    ]);
  });

  it("clears a woken snooze when the user acknowledges it", async () => {
    const { harness } = await loadPlugin();
    await harness.behavior.callRpc("snooze", {
      threadId: "thr_woke",
      snoozedUntil: Date.now() - 1,
    });

    await harness.behavior.callRpc("acknowledgeWake", {
      threadId: "thr_woke",
    });

    await expect(
      harness.behavior.callRpc("listLifecycle", {}),
    ).resolves.toEqual({ rows: [] });
  });

  it("does not settle when native unpinning fails", async () => {
    const { harness } = await loadPlugin({
      unpin: async () => {
        throw new Error("pin update failed");
      },
    });

    await expect(
      harness.behavior.callRpc("settle", { threadId: "thr_1" }),
    ).rejects.toThrow("pin update failed");
    await expect(
      harness.behavior.callRpc("listLifecycle", {}),
    ).resolves.toEqual({ rows: [] });
  });

  it("prunes lifecycle rows and signals when bb deletes the thread", async () => {
    const { harness } = await loadPlugin();
    await harness.behavior.callRpc("settle", { threadId: "thr_1" });

    await harness.behavior.emitThreadEvent("thread.deleted", {
      thread: makeThreadResponse({ id: "thr_1" }),
    });

    await expect(
      harness.behavior.callRpc("listLifecycle", {}),
    ).resolves.toEqual({ rows: [] });
    expect(harness.inspection.realtimeSignals).toContainEqual({
      channel: "lifecycle",
      payload: { threadId: "thr_1" },
    });
  });
});

describe("automatic settle evaluation", () => {
  it("evaluates inside listLifecycle and publishes one batched refresh", async () => {
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const { harness } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_old",
          createdAt: old,
          updatedAt: old,
          latestAttentionAt: old,
          status: "idle",
        }),
      ],
    });

    // No separate mount call: the list itself settles the thread.
    const first = (await harness.behavior.callRpc(
      "listLifecycle",
      {},
    )) as LifecycleListResult;
    expect(first.rows).toEqual([
      expect.objectContaining({
        threadId: "thr_old",
        settledAt: expect.any(Number),
        settledOverride: null,
      }),
    ]);
    const lifecycleSignals = () =>
      harness.inspection.realtimeSignals.filter(
        (signal) => signal.channel === "lifecycle",
      );
    expect(lifecycleSignals()).toEqual([
      { channel: "lifecycle", payload: { threadIds: ["thr_old"] } },
    ]);

    // Idempotent: a second list changes nothing and must not publish again,
    // or the signal it triggers would refresh into a loop.
    await harness.behavior.callRpc("listLifecycle", {});
    expect(lifecycleSignals()).toHaveLength(1);
  });

  it("skips a thread the sidebar reports as live work", async () => {
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const { harness } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_working",
          createdAt: old,
          updatedAt: old,
          latestAttentionAt: old,
          status: "idle",
        }),
      ],
    });

    // bb's session status is idle, but the client can see a running workflow.
    await expect(
      harness.behavior.callRpc("listLifecycle", {
        signals: [
          {
            threadId: "thr_working",
            hasPendingInteraction: false,
            isWorking: true,
          },
        ],
      }),
    ).resolves.toEqual({ rows: [] });
  });

  it("keeps manual un-settle active until real work clears the override", async () => {
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const thread = makeThreadResponse({
      id: "thr_override",
      createdAt: old,
      updatedAt: old,
      latestAttentionAt: old,
      status: "idle",
    });
    const { harness, db } = await loadPlugin({ threads: async () => [thread] });

    await harness.behavior.callRpc("unsettle", { threadId: "thr_override" });
    // The explicit override is immutable to the policy.
    await expect(
      harness.behavior.callRpc("evaluateAutoSettle", {}),
    ).resolves.toEqual({ changedThreadIds: [] });
    expect(rawRows(db)).toEqual([
      expect.objectContaining({
        thread_id: "thr_override",
        settled_at: null,
        settled_override: "active",
        state: "active",
      }),
    ]);

    await harness.behavior.emitThreadEvent("thread.active", { thread });
    // Real work drops the row outright, handing the thread back to policy.
    expect(rawRows(db)).toEqual([]);
    // The next list is free to settle it again — on the policy's terms, with
    // no override, which is exactly the state the fork ends in.
    const reevaluated = (await harness.behavior.callRpc(
      "listLifecycle",
      {},
    )) as LifecycleListResult;
    expect(reevaluated.rows).toEqual([
      expect.objectContaining({
        threadId: "thr_override",
        settledAt: expect.any(Number),
        settledOverride: null,
      }),
    ]);
  });

  it("looks up a shared environment once and settles merged PR threads together", async () => {
    const old = Date.now() - 60_000;
    const environmentId = "env_shared";
    const { harness } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_a",
          environmentId,
          createdAt: old,
          updatedAt: old,
          latestAttentionAt: old,
          status: "idle",
        }),
        makeThreadResponse({
          id: "thr_b",
          environmentId,
          createdAt: old,
          updatedAt: old,
          latestAttentionAt: old,
          status: "idle",
        }),
      ],
      pullRequest: async () => availablePullRequest("merged"),
    });

    await expect(
      harness.behavior.callRpc("evaluateAutoSettle", {}),
    ).resolves.toEqual({ changedThreadIds: ["thr_a", "thr_b"] });
    expect(
      harness.inspection.sdk.callsTo("environments.pullRequest"),
    ).toHaveLength(1);
  });

  it("clears policy-owned settled state when the user pins the thread", async () => {
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    let pinnedAt: number | null = null;
    const { harness } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_pin",
          createdAt: old,
          updatedAt: old,
          latestAttentionAt: old,
          pinnedAt,
          status: "idle",
        }),
      ],
    });

    await harness.behavior.callRpc("evaluateAutoSettle", {});
    pinnedAt = Date.now();
    await expect(
      harness.behavior.callRpc("evaluateAutoSettle", {}),
    ).resolves.toEqual({ changedThreadIds: ["thr_pin"] });
    await expect(
      harness.behavior.callRpc("listLifecycle", {}),
    ).resolves.toEqual({ rows: [] });
  });

  it("registers exactly one 5-minute schedule and no server timer", async () => {
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const { harness, db } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_scheduled",
          createdAt: old,
          updatedAt: old,
          latestAttentionAt: old,
          status: "idle",
        }),
      ],
    });

    expect(
      harness.inspection.registrations.schedules.map((schedule) => ({
        name: schedule.name,
        cron: schedule.cron,
      })),
    ).toEqual([{ name: "auto-settle", cron: "*/5 * * * *" }]);
    expect(harness.inspection.registrations.services).toEqual([]);

    // The raw table and the signal log are read before any RPC, so a no-op
    // schedule callback could not pass this: `listLifecycle` runs the same
    // evaluation and would settle the row itself.
    expect(rawRows(db)).toEqual([]);
    await harness.behavior.runSchedule("auto-settle");
    expect(
      rawRows(db).map((row) => ({ id: row.thread_id, state: row.state })),
    ).toEqual([{ id: "thr_scheduled", state: "settled" }]);
    expect(lifecycleSignals(harness)).toEqual([
      { channel: "lifecycle", payload: { threadIds: ["thr_scheduled"] } },
    ]);

    // A second sweep changes nothing, so it publishes nothing.
    const before = harness.inspection.realtimeSignals.length;
    await harness.behavior.runSchedule("auto-settle");
    expect(harness.inspection.realtimeSignals).toHaveLength(before);
    expect(rawRows(db)).toHaveLength(1);

    await expect(
      harness.behavior.callRpc("listLifecycle", {}),
    ).resolves.toEqual({
      rows: [expect.objectContaining({ threadId: "thr_scheduled" })],
    });
  });

  it("spares a thread the client reported live when the schedule sweeps", async () => {
    // The exact failure this guards: the host reports the thread idle, but the
    // sidebar can see a workflow or a raised hand it cannot. The signal is
    // remembered on the server, so the scheduled pass — which carries no
    // signals of its own — honours it too.
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const { harness, db } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_live",
          createdAt: old,
          updatedAt: old,
          latestAttentionAt: old,
          status: "idle",
        }),
      ],
    });

    await harness.behavior.callRpc("listLifecycle", {
      signals: [
        { threadId: "thr_live", hasPendingInteraction: true, isWorking: false },
      ],
    });
    expect(rawRows(db)).toEqual([]);

    await harness.behavior.runSchedule("auto-settle");
    expect(rawRows(db)).toEqual([]);
    expect(lifecycleSignals(harness)).toEqual([]);
  });

  it("holds a live thread indefinitely and releases it only when the client reports it quiet", async () => {
    // The failure this guards: live protection that expires on wall time. A
    // background action or a raised hand can stay live for hours without the
    // host reporting anything new, so nothing but an explicit quiet report
    // (or the thread's deletion) may end the hold.
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const { harness, db } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_live_long",
          createdAt: old,
          updatedAt: old,
          latestAttentionAt: old,
          status: "idle",
        }),
      ],
    });

    await harness.behavior.callRpc("listLifecycle", {
      signals: [
        {
          threadId: "thr_live_long",
          hasPendingInteraction: true,
          isWorking: false,
        },
      ],
    });
    expect(rawRows(db)).toEqual([]);

    // Sixteen minutes later — past any plausible expiry window — with no
    // further report of any kind, the scheduled sweep must still spare it.
    const realNow = Date.now;
    const clock = vi
      .spyOn(Date, "now")
      .mockImplementation(() => realNow() + 16 * 60_000);
    try {
      await harness.behavior.runSchedule("auto-settle");
      expect(rawRows(db)).toEqual([]);
      expect(lifecycleSignals(harness)).toEqual([]);

      // The same snapshot that carried the live signal now carries its end,
      // and the evaluation it drives may park the thread.
      await harness.behavior.callRpc("listLifecycle", {
        signals: [
          {
            threadId: "thr_live_long",
            hasPendingInteraction: false,
            isWorking: false,
          },
        ],
      });
      expect(
        rawRows(db).map((row) => ({ id: row.thread_id, state: row.state })),
      ).toEqual([{ id: "thr_live_long", state: "settled" }]);
      expect(lifecycleSignals(harness)).toEqual([
        { channel: "lifecycle", payload: { threadIds: ["thr_live_long"] } },
      ]);

      // And a later sweep is idempotent over that decision.
      await harness.behavior.runSchedule("auto-settle");
      expect(lifecycleSignals(harness)).toHaveLength(1);
      expect(rawRows(db)).toHaveLength(1);
    } finally {
      clock.mockRestore();
    }
  });

  it("keeps the earliest of 10,001 explicit live holds through a scheduled sweep", async () => {
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const recent = Date.now();
    const threads = Array.from({ length: 10_001 }, (_, index) =>
      makeThreadResponse({
        id: `thr_live_${index}`,
        createdAt: index === 0 ? old : recent,
        updatedAt: index === 0 ? old : recent,
        latestAttentionAt: index === 0 ? old : recent,
        status: "idle",
      }),
    );
    const { harness, db } = await loadPlugin({
      threads: async ({ limit = 500, offset = 0 } = {}) =>
        threads.slice(offset, offset + limit),
    });
    const signals = threads.map((thread) => ({
      threadId: thread.id,
      hasPendingInteraction: true,
      isWorking: false,
    }));

    // Each snapshot is schema-valid (the RPC caps one call at 10,000), and
    // omitted ids retain their existing holds.
    for (const chunk of [
      signals.slice(0, 4_000),
      signals.slice(4_000, 8_000),
      signals.slice(8_000),
    ]) {
      await harness.behavior.callRpc("listLifecycle", { signals: chunk });
    }

    await harness.behavior.runSchedule("auto-settle");
    expect(rawRows(db)).toEqual([]);
    expect(lifecycleSignals(harness)).toEqual([]);
  });

  it("prunes live holds only when the host sweep proves the thread is gone", async () => {
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const thread = makeThreadResponse({
      id: "thr_missing_then_reused",
      createdAt: old,
      updatedAt: old,
      latestAttentionAt: old,
      status: "idle",
    });
    let exists = true;
    const { harness, db } = await loadPlugin({
      threads: async () => (exists ? [thread] : []),
    });

    await harness.behavior.callRpc("listLifecycle", {
      signals: [
        {
          threadId: thread.id,
          hasPendingInteraction: true,
          isWorking: false,
        },
      ],
    });
    exists = false;
    await harness.behavior.runSchedule("auto-settle");
    exists = true;
    await harness.behavior.runSchedule("auto-settle");

    expect(rawRows(db)).toEqual([
      expect.objectContaining({
        thread_id: thread.id,
        state: "settled",
      }),
    ]);
    expect(lifecycleSignals(harness)).toEqual([
      { channel: "lifecycle", payload: { threadIds: [thread.id] } },
    ]);
  });

  it("runs one immediate follow-up when a frozen live hold turns quiet", async () => {
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const threadId = "thr_quiet_during_policy";
    // The gate below is the pull-request read, and the server now holds one
    // result per environment for a minute — so each pass reports a fresh
    // environment id, which is what keeps every pass doing the lookup this
    // test synchronises on. Nothing else about the scenario changes.
    let passCount = 0;
    const threadForPass = () =>
      makeThreadResponse({
        id: threadId,
        environmentId: `env_policy_gate_${(passCount += 1)}`,
        createdAt: old,
        updatedAt: old,
        latestAttentionAt: old,
        status: "idle",
      });
    let releasePolicy: () => void = () => {};
    const policyGate = new Promise<void>((resolve) => {
      releasePolicy = resolve;
    });
    let markDecisionReached: () => void = () => {};
    const decisionReached = new Promise<void>((resolve) => {
      markDecisionReached = resolve;
    });
    let pullRequestCalls = 0;
    const { harness, db } = await loadPlugin({
      threads: async () => [threadForPass()],
      pullRequest: async () => {
        pullRequestCalls += 1;
        if (pullRequestCalls === 2) {
          markDecisionReached();
          await policyGate;
        }
        return availablePullRequest("merged");
      },
    });

    await harness.behavior.callRpc("listLifecycle", {
      signals: [
        {
          threadId,
          hasPendingInteraction: false,
          isWorking: true,
        },
      ],
    });
    const sweep = harness.behavior.runSchedule("auto-settle");
    await decisionReached;
    const quiet = harness.behavior.callRpc("listLifecycle", {
      signals: [
        {
          threadId,
          hasPendingInteraction: false,
          isWorking: false,
        },
      ],
    });
    releasePolicy();
    await Promise.all([sweep, quiet]);

    expect(rawRows(db)).toEqual([
      expect.objectContaining({
        thread_id: threadId,
        state: "settled",
      }),
    ]);
    expect(lifecycleSignals(harness)).toEqual([
      { channel: "lifecycle", payload: { threadIds: [threadId] } },
    ]);
    expect(pullRequestCalls).toBe(3);

    await harness.behavior.callRpc("listLifecycle", {
      signals: [
        {
          threadId,
          hasPendingInteraction: false,
          isWorking: false,
        },
      ],
    });
    expect(lifecycleSignals(harness)).toHaveLength(1);
  });

  it("answers repeated lists from stored rows without re-paging threads or pull requests", async () => {
    // The client re-reads on every thread-list revision, which ticks
    // continuously while an agent streams. Only the first read may pay for a
    // full pass; the rest are one table read.
    const recent = Date.now();
    const { harness } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_busy",
          environmentId: "env_busy",
          createdAt: recent,
          updatedAt: recent,
          latestAttentionAt: recent,
          status: "idle",
        }),
      ],
      pullRequest: async () => availablePullRequest("open"),
    });
    await harness.behavior.callRpc("settle", { threadId: "thr_parked" });
    const signals = [
      {
        threadId: "thr_busy",
        hasPendingInteraction: false,
        isWorking: false,
      },
    ];

    await harness.behavior.callRpc("listLifecycle", { signals });
    const threadPages = harness.inspection.sdk.callsTo("threads.list").length;
    const pullRequests = harness.inspection.sdk.callsTo(
      "environments.pullRequest",
    ).length;
    expect(threadPages).toBeGreaterThan(0);
    expect(pullRequests).toBe(1);

    for (let revision = 0; revision < 5; revision += 1) {
      await expect(
        harness.behavior.callRpc("listLifecycle", { signals }),
      ).resolves.toEqual({
        rows: [expect.objectContaining({ threadId: "thr_parked" })],
      });
    }
    expect(harness.inspection.sdk.callsTo("threads.list")).toHaveLength(
      threadPages,
    );
    expect(
      harness.inspection.sdk.callsTo("environments.pullRequest"),
    ).toHaveLength(pullRequests);
  });

  it("still records a live hold on a list that runs no pass", async () => {
    // The answer may come from stored rows, but the report inside it is the
    // only place a live hold is taken, so it must land either way.
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const { harness, db } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_late_live",
          createdAt: old,
          updatedAt: old,
          latestAttentionAt: old,
          status: "idle",
        }),
      ],
    });

    // The first list pays for the pass — nothing is live yet, so it settles.
    await harness.behavior.callRpc("listLifecycle", {});
    await harness.behavior.callRpc("unsettle", { threadId: "thr_late_live" });
    await harness.behavior.emitThreadEvent("thread.active", {
      thread: makeThreadResponse({ id: "thr_late_live" }),
    });
    await harness.behavior.callRpc("listLifecycle", {});
    expect(rawRows(db)).toHaveLength(1);
    const threadPages = harness.inspection.sdk.callsTo("threads.list").length;

    // A thread going live cannot park anything, so this list runs no pass —
    // and must still remember the hold for the sweep that follows.
    await harness.behavior.callRpc("listLifecycle", {
      signals: [
        {
          threadId: "thr_late_live",
          hasPendingInteraction: false,
          isWorking: true,
        },
      ],
    });
    expect(harness.inspection.sdk.callsTo("threads.list")).toHaveLength(
      threadPages,
    );

    await harness.behavior.callRpc("unsettle", { threadId: "thr_late_live" });
    await harness.behavior.emitThreadEvent("thread.active", {
      thread: makeThreadResponse({ id: "thr_late_live" }),
    });
    await harness.behavior.runSchedule("auto-settle");
    expect(rawRows(db)).toEqual([]);

    // Releasing the hold re-evaluates immediately, inside the same cadence
    // window, and answers with the row it just wrote.
    await expect(
      harness.behavior.callRpc("listLifecycle", {
        signals: [
          {
            threadId: "thr_late_live",
            hasPendingInteraction: false,
            isWorking: false,
          },
        ],
      }),
    ).resolves.toEqual({
      rows: [
        expect.objectContaining({
          threadId: "thr_late_live",
          settledAt: expect.any(Number),
        }),
      ],
    });
  });

  it("sweeps on the schedule even when a list would be inside the cadence", async () => {
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const recent = Date.now();
    let stale = false;
    const { harness, db } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_cadence",
          createdAt: stale ? old : recent,
          updatedAt: stale ? old : recent,
          latestAttentionAt: stale ? old : recent,
          status: "idle",
        }),
      ],
    });

    await harness.behavior.callRpc("listLifecycle", {});
    expect(rawRows(db)).toEqual([]);
    stale = true;
    const threadPages = harness.inspection.sdk.callsTo("threads.list").length;

    // Inside the cadence a plain revision changes nothing and costs nothing.
    await expect(
      harness.behavior.callRpc("listLifecycle", {}),
    ).resolves.toEqual({ rows: [] });
    expect(harness.inspection.sdk.callsTo("threads.list")).toHaveLength(
      threadPages,
    );

    // The schedule is never throttled.
    await harness.behavior.runSchedule("auto-settle");
    expect(
      rawRows(db).map((row) => ({ id: row.thread_id, state: row.state })),
    ).toEqual([{ id: "thr_cadence", state: "settled" }]);
    expect(lifecycleSignals(harness)).toEqual([
      { channel: "lifecycle", payload: { threadIds: ["thr_cadence"] } },
    ]);
  });

  it("refreshes in the background once the cadence has elapsed", async () => {
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const recent = Date.now();
    let stale = false;
    const { harness, db } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_ttl",
          createdAt: stale ? old : recent,
          updatedAt: stale ? old : recent,
          latestAttentionAt: stale ? old : recent,
          status: "idle",
        }),
      ],
    });

    await harness.behavior.callRpc("listLifecycle", {});
    expect(rawRows(db)).toEqual([]);
    stale = true;

    // Five minutes on: the read-driven cadence must have elapsed by now.
    const realNow = Date.now;
    const clock = vi
      .spyOn(Date, "now")
      .mockImplementation(() => realNow() + 5 * 60_000);
    try {
      // The answer is the stored rows — the pass does not block it — and the
      // settle it makes reaches the client on LIFECYCLE_CHANNEL.
      await expect(
        harness.behavior.callRpc("listLifecycle", {}),
      ).resolves.toEqual({ rows: [] });
      await vi.waitFor(() =>
        expect(
          rawRows(db).map((row) => ({ id: row.thread_id, state: row.state })),
        ).toEqual([{ id: "thr_ttl", state: "settled" }]),
      );
      expect(lifecycleSignals(harness)).toEqual([
        { channel: "lifecycle", payload: { threadIds: ["thr_ttl"] } },
      ]);
    } finally {
      clock.mockRestore();
    }
  });

  it("re-evaluates on the next read after a settings change", async () => {
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    const { harness, db } = await loadPlugin({
      threads: async () => [
        makeThreadResponse({
          id: "thr_settings",
          createdAt: old,
          updatedAt: old,
          latestAttentionAt: old,
          status: "idle",
        }),
      ],
    });
    await harness.behavior.callRpc("updateSidebarSettings", {
      ...DEFAULT_SIDEBAR_SETTINGS,
      autoSettleInactive: false,
      autoSettleOnMerge: false,
    });

    await harness.behavior.callRpc("listLifecycle", {});
    expect(rawRows(db)).toEqual([]);

    // Turning the policy on must take effect on the next read, not at the end
    // of the read cadence.
    await harness.behavior.callRpc("updateSidebarSettings", {
      ...DEFAULT_SIDEBAR_SETTINGS,
      autoSettleInactive: true,
      autoSettleAfterDays: 1,
      autoSettleOnMerge: false,
    });
    await expect(
      harness.behavior.callRpc("listLifecycle", {}),
    ).resolves.toEqual({
      rows: [
        expect.objectContaining({
          threadId: "thr_settings",
          settledAt: expect.any(Number),
        }),
      ],
    });
  });

  it("merges a client's live set into a sweep that is already in flight", async () => {
    // Coalescing must not hand a caller an answer decided without its signals.
    const old = Date.now() - 4 * 24 * 60 * 60 * 1_000;
    let releaseThreads: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseThreads = resolve;
    });
    let gated = true;
    const { harness, db } = await loadPlugin({
      threads: async () => {
        if (gated) {
          gated = false;
          await gate;
        }
        return [
          makeThreadResponse({
            id: "thr_live",
            createdAt: old,
            updatedAt: old,
            latestAttentionAt: old,
            status: "idle",
          }),
        ];
      },
    });

    const sweep = harness.behavior.runSchedule("auto-settle");
    const client = harness.behavior.callRpc("listLifecycle", {
      signals: [
        { threadId: "thr_live", hasPendingInteraction: false, isWorking: true },
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseThreads();
    await sweep;
    await client;

    expect(rawRows(db)).toEqual([]);
    expect(lifecycleSignals(harness)).toEqual([]);
  });
});
