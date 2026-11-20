import {
  type ContextWindowSnapshot,
  deriveLatestContextWindowSnapshot,
  latestProviderTurnTokenUsage,
} from "@t3tools/client-runtime/state/context-window";

import {
  useSelectedThreadProjection,
  useSelectedThreadVisibleTurnItems,
} from "../../state/use-thread-detail";

// Same derivation as desktop's ChatView, so both clients report the same usage.
export function useSelectedThreadContextWindow(): ContextWindowSnapshot | null {
  const selected = useSelectedThreadProjection();
  const visibleTurnItems = useSelectedThreadVisibleTurnItems();
  if (selected === null) return null;
  const { projection } = selected;
  const providerThread = projection.providerThreads.find(
    (thread) => thread.id === projection.thread.activeProviderThreadId,
  );
  const liveUsage = latestProviderTurnTokenUsage(
    projection.providerTurns,
    projection,
    providerThread,
  );
  return deriveLatestContextWindowSnapshot(visibleTurnItems, liveUsage, providerThread);
}
