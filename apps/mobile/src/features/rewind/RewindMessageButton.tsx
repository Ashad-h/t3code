import { errorDisplayMessage } from "@t3tools/client-runtime/errors";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  CommandId,
  type EnvironmentId,
  type MessageId,
  type OrchestrationMessageContext,
  type OrchestrationV2ThreadProjection,
  type ThreadId,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Haptics from "expo-haptics";
import { useAtomValue } from "@effect/atom-react";
import { useGT, useMessages } from "gt-react-native";
import { type ColorValue, Pressable } from "react-native";

import { SymbolView } from "../../components/ui/AppSymbol";
import * as Dialog from "../../components/ui/Dialog";
import { scopedThreadKey } from "../../lib/scopedEntities";
import { uuidv4 } from "../../lib/uuid";
import { appAtomRegistry } from "../../state/atom-registry";
import { readEnvironmentScope } from "../../state/session";
import { environmentThreadDetails, threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { mergeComposerDraftContent } from "../../state/use-composer-drafts";
import { rewindComposerContent } from "./rewindComposerContent";
import { beginThreadRewind, endThreadRewind, threadRewindingAtom } from "./rewindLock";
import { useRewindTarget } from "./rewindState";
import { findRewindCheckpoint } from "./rewindTargets";
import { waitForRewind } from "./waitForRewind";

function useRevertCheckpoint() {
  return useAtomCommand(threadEnvironment.revertCheckpoint, { reportFailure: false });
}

/** Fork (Drawo Code): desktop's "Edit from here" on a sent message. */
export function RewindMessageButton(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly text: string;
  readonly context: OrchestrationMessageContext | undefined;
  readonly hasAttachments: boolean;
  readonly tintColor: ColorValue;
}) {
  const gt = useGT();
  const m = useMessages();
  const threadKey = scopedThreadKey(props.environmentId, props.threadId);
  const busy = useAtomValue(threadRewindingAtom(threadKey));
  const turnCount = useRewindTarget(props);
  const revertCheckpoint = useRevertCheckpoint();
  if (
    turnCount === null ||
    !readEnvironmentScope(props.environmentId, AuthOrchestrationOperateScope)
  )
    return null;

  const ref = scopeThreadRef(props.environmentId, props.threadId);
  const stateAtom = environmentThreadDetails.stateAtom(ref);
  const readProjection = () => Option.getOrNull(appAtomRegistry.get(stateAtom).data);

  const rewind = (restoreFiles: boolean) => {
    if (!beginThreadRewind(threadKey)) return;
    void rewindBeforeMessage({
      ...props,
      turnCount,
      restoreFiles,
      readProjection,
      subscribe: (listener) => appAtomRegistry.subscribe(stateAtom, listener),
      revertCheckpoint,
    }).then(
      () => endThreadRewind(threadKey),
      (error: unknown) => {
        endThreadRewind(threadKey);
        Dialog.alert(
          gt("Could not rewind"),
          errorDisplayMessage(error, m) ?? gt("Please try again."),
        );
      },
    );
  };

  const confirm = () => {
    const projection = readProjection();
    // The server refuses file restore outside an isolated worktree.
    const canRestoreFiles =
      projection?.thread.worktreePath != null &&
      findRewindCheckpoint(projection.checkpoints, turnCount)?.status === "ready";
    const description = [
      gt("Rewind chat to before this message. Your prompt returns to the composer."),
      canRestoreFiles ? gt("“Revert files too” also undoes your own edits.") : null,
      props.hasAttachments ? gt("Its attachments don't come back on the phone.") : null,
    ]
      .filter((line) => line !== null)
      .join(" ");
    void Haptics.selectionAsync();
    Dialog.alert(gt("Edit from here?"), description, [
      { text: gt("Cancel"), style: "cancel" },
      ...(canRestoreFiles
        ? [
            {
              text: gt("Revert files too"),
              style: "destructive" as const,
              onPress: () => void rewind(true),
            },
          ]
        : []),
      { text: gt("Revert and keep changes"), onPress: () => void rewind(false) },
    ]);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={gt("Edit from here")}
      disabled={busy}
      hitSlop={8}
      className="size-7 items-center justify-center disabled:opacity-40"
      onPress={confirm}
    >
      <SymbolView name="arrow.uturn.backward" size={14} tintColor={props.tintColor} />
    </Pressable>
  );
}

// Outside the component: the React Compiler cannot lower async error handling.
async function rewindBeforeMessage(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly text: string;
  readonly context: OrchestrationMessageContext | undefined;
  readonly turnCount: number;
  readonly restoreFiles: boolean;
  readonly readProjection: () => OrchestrationV2ThreadProjection | null;
  readonly subscribe: (listener: () => void) => () => void;
  readonly revertCheckpoint: ReturnType<typeof useRevertCheckpoint>;
}): Promise<void> {
  const checkpoint = findRewindCheckpoint(
    input.readProjection()?.checkpoints ?? [],
    input.turnCount,
  );
  const commandId = CommandId.make(uuidv4());
  await waitForRewind({
    read: input.readProjection,
    subscribe: input.subscribe,
    turnCount: input.turnCount,
    requestId: commandId,
    revert: async () => {
      const result = await input.revertCheckpoint({
        environmentId: input.environmentId,
        input: {
          commandId,
          threadId: input.threadId,
          turnCount: input.turnCount,
          restoreFiles: input.restoreFiles,
          ...(checkpoint === undefined
            ? {}
            : { checkpointId: checkpoint.id, scopeId: checkpoint.scopeId }),
        },
      });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    },
  });
  await mergeComposerDraftContent(scopedThreadKey(input.environmentId, input.threadId), {
    ...rewindComposerContent({ text: input.text, context: input.context }),
    attachments: [],
  });
}
