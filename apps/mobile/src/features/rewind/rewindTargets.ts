import type { ThreadStructure } from "@t3tools/client-runtime/state/models";
import type { MessageId, RunId } from "@t3tools/contracts";

// Fork (Drawo Code): mobile port of desktop's rewind eligibility (apps/web session-logic.ts
// deriveRevertTurnCountByUserMessageId, findRevertCheckpoint, and ChatView.logic.ts
// deriveAvailableRevertTurnCounts), which mobile cannot import.

type Checkpoint = ThreadStructure["checkpoints"][number];
type VisibleTurnItem = ThreadStructure["visibleTurnItems"][number];

const SETTLED_RUN_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
]);

// A missing snapshot (no git, or a side chat) still pins a conversation position; only
// restoring files needs a ready one.
function isRewindableCheckpoint(checkpoint: Pick<Checkpoint, "status">): boolean {
  return checkpoint.status === "ready" || checkpoint.status === "missing";
}

export function findRewindCheckpoint(
  checkpoints: ReadonlyArray<Checkpoint>,
  turnCount: number,
): Checkpoint | undefined {
  return checkpoints.findLast(
    (checkpoint) =>
      isRewindableCheckpoint(checkpoint) &&
      (turnCount === 0
        ? checkpoint.ordinalWithinScope === 0 && checkpoint.appRunOrdinal === null
        : checkpoint.appRunOrdinal === turnCount),
  );
}

/** Turn counts the provider conversation itself can return to; a file checkpoint alone cannot. */
export function availableRewindTurnCounts(projection: ThreadStructure): ReadonlySet<number> {
  const available = new Set<number>();
  const providerThread = projection.providerThreads.find(
    (candidate) => candidate.id === projection.thread.activeProviderThreadId,
  );
  if (
    !providerThread?.providerSessionId ||
    providerThread.providerInstanceId !== projection.thread.modelSelection.instanceId
  )
    return available;
  available.add(0);
  const attemptsById = new Map(projection.attempts.map((attempt) => [attempt.id, attempt]));
  const providerTurnsById = new Map(projection.providerTurns.map((turn) => [turn.id, turn]));
  const latestTurnByAttempt = new Map<string, ThreadStructure["providerTurns"][number]>();
  for (const turn of projection.providerTurns) {
    if (turn.runAttemptId === null) continue;
    const latest = latestTurnByAttempt.get(turn.runAttemptId);
    if (latest === undefined || turn.ordinal > latest.ordinal) {
      latestTurnByAttempt.set(turn.runAttemptId, turn);
    }
  }
  for (const run of projection.runs) {
    if (run.activeAttemptId === null) continue;
    const attempt = attemptsById.get(run.activeAttemptId);
    const providerTurn =
      latestTurnByAttempt.get(run.activeAttemptId) ??
      (attempt?.providerTurnId == null ? undefined : providerTurnsById.get(attempt.providerTurnId));
    if (providerTurn?.providerThreadId === providerThread.id) available.add(run.ordinal);
  }
  return available;
}

/** Each sent user message's rewind target: the checkpoint of the run shown before it. */
export function rewindTurnCountsByMessageId(input: {
  readonly visibleTurnItems: ReadonlyArray<VisibleTurnItem>;
  readonly checkpoints: ReadonlyArray<Checkpoint>;
  readonly threadStartCheckpointAvailable: boolean;
  readonly availableTurnCounts: ReadonlySet<number>;
}): ReadonlyMap<MessageId, number> {
  const turnCountByRunId = new Map<RunId, number>();
  for (const checkpoint of input.checkpoints) {
    if (
      isRewindableCheckpoint(checkpoint) &&
      checkpoint.runId !== null &&
      checkpoint.appRunOrdinal !== null
    ) {
      turnCountByRunId.set(checkpoint.runId, checkpoint.appRunOrdinal);
    }
  }
  const targetByRunId = new Map<RunId, number | undefined>();
  const byMessageId = new Map<MessageId, number>();
  let previousRunId: RunId | null = null;
  for (const { visibility, item } of input.visibleTurnItems) {
    // Inherited history belongs to the source thread, not this thread's checkpoint scope.
    if (visibility === "inherited") continue;
    if (
      item.type !== "user_message" &&
      item.type !== "assistant_message" &&
      item.type !== "notification"
    )
      continue;
    if (
      item.type === "user_message" &&
      item.inputIntent === "queued_turn" &&
      item.status === "pending"
    )
      continue;
    const runId = item.runId;
    if (runId === null) continue;
    if (!targetByRunId.has(runId)) {
      targetByRunId.set(
        runId,
        previousRunId === null
          ? input.threadStartCheckpointAvailable
            ? 0
            : undefined
          : turnCountByRunId.get(previousRunId),
      );
      previousRunId = runId;
    }
    if (item.type !== "user_message") continue;
    if (item.inputIntent !== "turn_start" && item.inputIntent !== "queued_turn") continue;
    const target = targetByRunId.get(runId);
    if (target !== undefined && input.availableTurnCounts.has(target)) {
      byMessageId.set(item.messageId, target);
    }
  }
  return byMessageId;
}

/** Nothing is offered while a run is unsettled: the server refuses a rewind then. */
export function deriveRewindTargets(input: {
  readonly projection: ThreadStructure;
  readonly hasMoreHistory: boolean;
}): ReadonlyMap<MessageId, number> {
  const { projection } = input;
  if (projection.runs.some((run) => !SETTLED_RUN_STATUSES.has(run.status))) return new Map();
  return rewindTurnCountsByMessageId({
    visibleTurnItems: projection.visibleTurnItems,
    checkpoints: projection.checkpoints,
    // A paged history window cannot identify the first loaded run as the thread start.
    threadStartCheckpointAvailable:
      !input.hasMoreHistory && findRewindCheckpoint(projection.checkpoints, 0) !== undefined,
    availableTurnCounts: availableRewindTurnCounts(projection),
  });
}
