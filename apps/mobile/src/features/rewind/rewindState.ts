import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { serverEnvironment } from "../../state/server";
import { environmentThreadDetails } from "../../state/threads";
import { deriveRewindTargets } from "./rewindTargets";

// Fork (Drawo Code): each feed row reads only its own message's target, so streamed text and
// other rows' changes do not re-render it.

interface ThreadTarget {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

const EMPTY_TARGETS: ReadonlyMap<MessageId, number> = new Map();

const hasMoreHistoryAtomFamily = Atom.family((key: string) => {
  const target = JSON.parse(key) as ThreadTarget;
  const ref = scopeThreadRef(target.environmentId, target.threadId);
  return Atom.make(
    (get) => get(environmentThreadDetails.stateAtom(ref)).history.hasMoreHistory,
  ).pipe(Atom.withLabel(`mobile-rewind-has-more-history:${key}`));
});

const threadTargetsAtomFamily = Atom.family((key: string) => {
  const target = JSON.parse(key) as ThreadTarget;
  const ref = scopeThreadRef(target.environmentId, target.threadId);
  return Atom.make((get): ReadonlyMap<MessageId, number> => {
    const scoped = get(environmentThreadDetails.quietThreadAtom(ref));
    if (scoped === null) return EMPTY_TARGETS;
    const { projection } = scoped;
    const provider = get(serverEnvironment.configValueAtom(target.environmentId))?.providers.find(
      (candidate) => candidate.instanceId === projection.thread.modelSelection.instanceId,
    );
    if (provider?.supportsConversationRollback === false) return EMPTY_TARGETS;
    return deriveRewindTargets({ projection, hasMoreHistory: get(hasMoreHistoryAtomFamily(key)) });
  }).pipe(Atom.withLabel(`mobile-rewind-targets:${key}`));
});

const messageTargetAtomFamily = Atom.family((key: string) => {
  const { messageId, ...thread } = JSON.parse(key) as ThreadTarget & {
    readonly messageId: MessageId;
  };
  const threadKey = JSON.stringify({
    environmentId: thread.environmentId,
    threadId: thread.threadId,
  });
  return Atom.make((get) => get(threadTargetsAtomFamily(threadKey)).get(messageId) ?? null).pipe(
    Atom.withLabel(`mobile-rewind-target:${key}`),
  );
});

/** The turn count rewinding before this message returns to, or null when it can't be rewound. */
export function useRewindTarget(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
}): number | null {
  return useAtomValue(
    messageTargetAtomFamily(
      JSON.stringify({
        environmentId: input.environmentId,
        threadId: input.threadId,
        messageId: input.messageId,
      }),
    ),
  );
}
