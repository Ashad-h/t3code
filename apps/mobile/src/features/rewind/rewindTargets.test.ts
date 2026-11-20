import type { ThreadStructure } from "@t3tools/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import {
  availableRewindTurnCounts,
  deriveRewindTargets,
  findRewindCheckpoint,
  rewindTurnCountsByMessageId,
} from "./rewindTargets";

type VisibleItem = ThreadStructure["visibleTurnItems"][number];
type Checkpoint = ThreadStructure["checkpoints"][number];
type CheckpointStatus = Checkpoint["status"];

const runId = (ordinal: number) => `run-${ordinal}`;

function item(
  type: "user_message" | "assistant_message" | "notification",
  ordinal: number,
  overrides: { visibility?: VisibleItem["visibility"]; status?: string; inputIntent?: string } = {},
): VisibleItem {
  return {
    position: 0,
    visibility: overrides.visibility ?? "local",
    sourceThreadId: "thread",
    sourceItemId: `${type}-${ordinal}`,
    item: {
      id: `${type}-${ordinal}`,
      type,
      runId: runId(ordinal),
      status: overrides.status ?? "completed",
      ...(type === "notification"
        ? {}
        : { messageId: `${type === "user_message" ? "user" : "assistant"}-${ordinal}` }),
      ...(type === "user_message" ? { inputIntent: overrides.inputIntent ?? "turn_start" } : {}),
    },
  } as unknown as VisibleItem;
}

const turn = (ordinal: number) => [
  item("user_message", ordinal),
  item("assistant_message", ordinal),
];

function checkpoint(ordinal: number | null, status: CheckpointStatus = "ready"): Checkpoint {
  return {
    id: `checkpoint-${ordinal ?? "start"}`,
    scopeId: "scope",
    runId: ordinal === null ? null : runId(ordinal),
    appRunOrdinal: ordinal,
    ordinalWithinScope: ordinal ?? 0,
    status,
  } as unknown as Checkpoint;
}

function targets(
  visibleTurnItems: ReadonlyArray<VisibleItem>,
  checkpoints: ReadonlyArray<Checkpoint>,
  options: { threadStart?: boolean; available?: ReadonlyArray<number> } = {},
) {
  return Object.fromEntries(
    rewindTurnCountsByMessageId({
      visibleTurnItems,
      checkpoints,
      threadStartCheckpointAvailable: options.threadStart ?? true,
      availableTurnCounts: new Set(options.available ?? [0, 1, 2, 3, 4, 5, 6, 7, 8]),
    }),
  );
}

describe("rewindTurnCountsByMessageId", () => {
  it("targets the previous visible checkpoint, skipping rewound and stale ones", () => {
    // Runs 1 and 3 were rewound; run 5 stopped without capturing a checkpoint.
    expect(
      targets([2, 4, 5].flatMap(turn), [checkpoint(2), checkpoint(3, "stale"), checkpoint(4)]),
    ).toEqual({ "user-2": 0, "user-4": 2, "user-5": 4 });
    // Without file snapshots, missing checkpoints still pin the conversation.
    expect(
      targets([1, 2].flatMap(turn), [checkpoint(1, "missing"), checkpoint(2, "missing")]),
    ).toEqual({ "user-1": 0, "user-2": 1 });
  });

  it("hides a message whose predecessor is unknown", () => {
    expect(targets([1, 2].flatMap(turn), [checkpoint(1, "error"), checkpoint(2)])).toEqual({
      "user-1": 0,
    });
    // Earlier history is paged out, so the first loaded run's predecessor is unknown.
    expect(
      targets([4, 5].flatMap(turn), [checkpoint(4), checkpoint(5)], { threadStart: false }),
    ).toEqual({ "user-5": 4 });
  });

  it("skips inherited history and counts notification-only runs", () => {
    expect(
      targets(
        [
          item("user_message", 7, { visibility: "inherited" }),
          item("notification", 7, { visibility: "inherited" }),
          ...turn(1),
          item("notification", 2),
          ...turn(3),
        ],
        [checkpoint(7), checkpoint(1), checkpoint(2), checkpoint(3)],
      ),
    ).toEqual({ "user-1": 0, "user-3": 2 });
  });

  it("offers only sent turn messages", () => {
    expect(
      targets(
        [
          ...turn(1),
          item("user_message", 2, { inputIntent: "steer" }),
          item("user_message", 3, { inputIntent: "queued_turn", status: "pending" }),
        ],
        [checkpoint(1), checkpoint(2)],
      ),
    ).toEqual({ "user-1": 0 });
  });

  it("keeps only turn counts the provider conversation can return to", () => {
    expect(
      targets([1, 2, 3].flatMap(turn), [checkpoint(1), checkpoint(2), checkpoint(3)], {
        available: [0, 1],
      }),
    ).toEqual({ "user-1": 0, "user-2": 1 });
  });
});

describe("availableRewindTurnCounts", () => {
  const providerThreadId = "provider-thread";

  function projection(providerSessionId: string | null): ThreadStructure {
    const run = (ordinal: number) => ({
      id: runId(ordinal),
      ordinal,
      activeAttemptId: `attempt-${ordinal}`,
    });
    const providerTurn = (ordinal: number, attempt: number, threadId: string) => ({
      id: `turn-${attempt}-${ordinal}`,
      runAttemptId: `attempt-${attempt}`,
      ordinal,
      providerThreadId: threadId,
    });
    return {
      thread: {
        activeProviderThreadId: providerThreadId,
        modelSelection: { instanceId: "instance" },
      },
      providerThreads: [
        { id: providerThreadId, providerInstanceId: "instance", providerSessionId },
      ],
      runs: [run(1), run(2), run(3)],
      attempts: [1, 2, 3].map((ordinal) => ({ id: `attempt-${ordinal}`, providerTurnId: null })),
      // Run 2's latest turn moved to another provider thread, so its checkpoint cannot restore
      // this conversation.
      providerTurns: [
        providerTurn(1, 1, providerThreadId),
        providerTurn(1, 2, providerThreadId),
        providerTurn(2, 2, "other-provider-thread"),
        providerTurn(1, 3, providerThreadId),
      ],
    } as unknown as ThreadStructure;
  }

  it("offers the thread start and runs whose latest turn is on the active provider thread", () => {
    expect([...availableRewindTurnCounts(projection("session"))].toSorted()).toEqual([0, 1, 3]);
  });

  it("offers nothing without a provider session to rewind", () => {
    expect(availableRewindTurnCounts(projection(null)).size).toBe(0);
  });
});

describe("deriveRewindTargets", () => {
  function projection(input: {
    readonly runStatuses: ReadonlyArray<string>;
    readonly checkpoints: ReadonlyArray<Checkpoint>;
  }): ThreadStructure {
    const ordinals = input.runStatuses.map((_, index) => index + 1);
    return {
      thread: { activeProviderThreadId: "provider-thread", modelSelection: { instanceId: "i" } },
      providerThreads: [
        { id: "provider-thread", providerInstanceId: "i", providerSessionId: "session" },
      ],
      runs: ordinals.map((ordinal) => ({
        id: runId(ordinal),
        ordinal,
        status: input.runStatuses[ordinal - 1],
        activeAttemptId: `attempt-${ordinal}`,
      })),
      attempts: ordinals.map((ordinal) => ({ id: `attempt-${ordinal}`, providerTurnId: null })),
      providerTurns: ordinals.map((ordinal) => ({
        id: `turn-${ordinal}`,
        runAttemptId: `attempt-${ordinal}`,
        ordinal: 1,
        providerThreadId: "provider-thread",
      })),
      checkpoints: input.checkpoints,
      visibleTurnItems: ordinals.flatMap(turn),
    } as unknown as ThreadStructure;
  }

  it("rewinds to the thread start only when the whole history is loaded", () => {
    const thread = projection({
      runStatuses: ["completed", "completed"],
      checkpoints: [checkpoint(null), checkpoint(1), checkpoint(2)],
    });
    expect(
      Object.fromEntries(deriveRewindTargets({ projection: thread, hasMoreHistory: false })),
    ).toEqual({ "user-1": 0, "user-2": 1 });
    expect(
      Object.fromEntries(deriveRewindTargets({ projection: thread, hasMoreHistory: true })),
    ).toEqual({ "user-2": 1 });
  });

  it("offers nothing while a run is still going", () => {
    const thread = projection({
      runStatuses: ["completed", "running"],
      checkpoints: [checkpoint(null), checkpoint(1)],
    });
    expect(deriveRewindTargets({ projection: thread, hasMoreHistory: false }).size).toBe(0);
  });
});

describe("findRewindCheckpoint", () => {
  it("finds the thread-start snapshot for turn 0 and skips unusable ones", () => {
    const checkpoints = [checkpoint(null), checkpoint(1, "stale"), checkpoint(2, "missing")];
    expect(findRewindCheckpoint(checkpoints, 0)?.id).toBe("checkpoint-start");
    expect(findRewindCheckpoint(checkpoints, 1)).toBeUndefined();
    expect(findRewindCheckpoint(checkpoints, 2)?.id).toBe("checkpoint-2");
  });
});
