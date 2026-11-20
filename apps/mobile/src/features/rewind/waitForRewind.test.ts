import type { CommandId, OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { waitForRewind } from "./waitForRewind";

const requestId = "rollback-1" as CommandId;

function projection(input: {
  readonly lastRunOrdinal: number | null;
  readonly runStatuses: ReadonlyArray<string>;
  readonly rollbackFailure?: { readonly requestId: string; readonly message: string };
}): OrchestrationV2ThreadProjection {
  return {
    thread: {
      id: "thread",
      activeProviderThreadId: "provider-thread",
      ...(input.rollbackFailure ? { rollbackFailure: input.rollbackFailure } : {}),
    },
    providerThreads: [
      {
        id: "provider-thread",
        providerInstanceId: "instance",
        appThreadId: "thread",
        ownerNodeId: null,
        lastRunOrdinal: input.lastRunOrdinal,
      },
    ],
    runs: input.runStatuses.map((status, index) => ({
      id: `run-${index + 1}`,
      ordinal: index + 1,
      status,
    })),
  } as unknown as OrchestrationV2ThreadProjection;
}

function store(initial: OrchestrationV2ThreadProjection) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    read: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(next: OrchestrationV2ThreadProjection) {
      current = next;
      for (const listener of listeners) listener();
    },
  };
}

describe("waitForRewind", () => {
  it("resolves once the later runs are rolled back on the provider thread", async () => {
    const thread = store(
      projection({ lastRunOrdinal: 3, runStatuses: ["completed", "completed", "completed"] }),
    );
    let settled = false;
    const waiting = waitForRewind({
      read: thread.read,
      subscribe: thread.subscribe,
      turnCount: 1,
      requestId,
      revert: async () => {},
    }).then(() => {
      settled = true;
    });
    await Promise.resolve();
    // The provider moved back, but the run is not rolled back yet.
    thread.publish(
      projection({ lastRunOrdinal: 1, runStatuses: ["completed", "completed", "completed"] }),
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    thread.publish(
      projection({ lastRunOrdinal: 1, runStatuses: ["completed", "rolled_back", "rolled_back"] }),
    );
    await waiting;
    expect(settled).toBe(true);
  });

  it("rejects with the projected reason when this rewind fails", async () => {
    const thread = store(
      projection({ lastRunOrdinal: 2, runStatuses: ["completed", "completed"] }),
    );
    const waiting = waitForRewind({
      read: thread.read,
      subscribe: thread.subscribe,
      turnCount: 1,
      requestId,
      revert: async () => {
        thread.publish(
          projection({
            lastRunOrdinal: 2,
            runStatuses: ["completed", "completed"],
            rollbackFailure: { requestId, message: "Provider refused the rollback." },
          }),
        );
      },
    });
    await expect(waiting).rejects.toThrow("Provider refused the rollback.");
  });

  it("refuses when no settled run follows the target", async () => {
    const thread = store(projection({ lastRunOrdinal: 2, runStatuses: ["completed", "running"] }));
    await expect(
      waitForRewind({
        read: thread.read,
        subscribe: thread.subscribe,
        turnCount: 1,
        requestId,
        revert: async () => {},
      }),
    ).rejects.toThrow("The thread has changed. Select a message to rewind again.");
  });

  it("rejects with the command's error when the server refuses it", async () => {
    const thread = store(
      projection({ lastRunOrdinal: 2, runStatuses: ["completed", "completed"] }),
    );
    await expect(
      waitForRewind({
        read: thread.read,
        subscribe: thread.subscribe,
        turnCount: 1,
        requestId,
        revert: async () => {
          throw new Error("Interrupt the current turn first.");
        },
      }),
    ).rejects.toThrow("Interrupt the current turn first.");
  });
});
