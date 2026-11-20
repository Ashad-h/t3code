import type { CommandId, OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { msg } from "gt-react-native";

import { m } from "../../i18n/messages";

// Fork (Drawo Code): mobile port of desktop's waitForRevertedMessage (apps/web ChatView.logic.ts),
// with the projection reader and subscription passed in.

const SETTLED_RUN_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "interrupted",
  "failed",
  "cancelled",
]);

/** Sends the rewind and resolves once the thread shows it: the later runs rolled back. */
export function waitForRewind(input: {
  readonly read: () => OrchestrationV2ThreadProjection | null;
  readonly subscribe: (listener: () => void) => () => void;
  readonly turnCount: number;
  readonly requestId: CommandId;
  readonly revert: () => Promise<void>;
  readonly timeoutMs?: number;
}): Promise<void> {
  const { turnCount } = input;
  const initial = input.read();
  const providerThreadId = initial?.thread.activeProviderThreadId;
  const initialProviderThread = initial?.providerThreads.find(
    (providerThread) => providerThread.id === providerThreadId,
  );
  const initialProviderThreadIds = new Set(initial?.providerThreads.map((thread) => thread.id));
  // Paging can omit the source run. Rollback commits the entire settled suffix atomically.
  const witness = initial?.runs.reduce<(typeof initial.runs)[number] | undefined>((latest, run) => {
    if (run.ordinal <= turnCount || !SETTLED_RUN_STATUSES.has(run.status)) return latest;
    return latest === undefined || run.ordinal > latest.ordinal ? run : latest;
  }, undefined);
  if (witness === undefined) {
    return Promise.reject(
      new Error(m(msg("The thread has changed. Select a message to rewind again."))),
    );
  }
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let accepted = false;
    let unsubscribe = () => {};
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) globalThis.clearTimeout(timeout);
      unsubscribe();
      if (error !== undefined) reject(error);
      else resolve();
    };
    const inspect = () => {
      const thread = input.read();
      if (!thread) return;
      const failure = thread.thread.rollbackFailure;
      if (failure?.requestId === input.requestId) {
        finish(new Error(failure.message));
        return;
      }
      if (
        accepted &&
        thread.providerThreads.some(
          (providerThread) =>
            (providerThread.id === providerThreadId ||
              // Claude resets to a fresh root session when rewinding to thread start.
              (turnCount === 0 &&
                providerThread.ownerNodeId === null &&
                providerThread.appThreadId === initial?.thread.id &&
                providerThread.providerInstanceId === initialProviderThread?.providerInstanceId &&
                !initialProviderThreadIds.has(providerThread.id))) &&
            providerThread.lastRunOrdinal === (turnCount === 0 ? null : turnCount),
        ) &&
        thread.runs.some((run) => run.id === witness.id && run.status === "rolled_back")
      )
        finish();
    };
    unsubscribe = input.subscribe(inspect);
    timeout = globalThis.setTimeout(() => {
      finish(new Error(m(msg("Timed out waiting for the thread to rewind."))));
    }, input.timeoutMs ?? 120_000);
    Promise.resolve()
      .then(input.revert)
      .then(() => {
        accepted = true;
        inspect();
      }, finish);
  });
}
